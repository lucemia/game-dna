# Harbour Charter: N-06 starter (system element)

`index.html` is a complete single-file cosy town builder on `module/wfc-town-3d.js` v1.1.0 (pasted unchanged into its own `<script>`). `three.min.js` (three.js 0.149.0, MIT) must sit next to it.

- **Island:** a 14 x 14 sea with a small island and three cottages. Click (or tap) a cell to raise it: sea becomes land, land becomes a house, a house gains a storey (up to 6). Right-click, or the Remove tool, lowers it. Walls, doors, windows, balconies, lanes, roofs, stairs and gate arches resolve from the neighbours by wave function collapse; only the cells near the edit are re-solved.
- **Goals (the charter):** grow the island to 78 tiles, raise 20 houses, 10 front doors on lanes, a tower of 4 storeys, a gate arch over a lane, 2 stairs up to roof terraces. Each completed goal shows a banner; with all of them the town is granted its charter (`GAME.result = 'charter'`, a card; Z or a tap keeps building, R starts a new island).
- **Input:** mouse hover shows a ghost of the storey a click adds (red: removes); drag to orbit, wheel to zoom. Keys: arrows / WASD move the cursor in screen directions, Z / Space / Enter build, X / Backspace remove, Tab or M switch Build / Remove, U or Ctrl+Z undo, Y or Ctrl+Y redo, Q / E turn the camera 45 deg, + / - zoom, C or 1-4 palette, P autoplay on / off, R new island. Toolbar: Build, Remove, Undo, Redo, Turn, Turn, Auto; palette chips top right.
- **Autoplay** (`?auto=1` or P): a goal-driven builder that clicks through the same `act()` path as the player every 560 ms: grows the island, raises houses that keep lanes open, raises a tower, re-rolls one-storey houses until roof stairs appear, and builds two flanking houses with a bridge house between them until an arch forms. Seed 1: charter at about 27.6 s of game time (all seeds 1-8 finish in 21-34 s).
- **URL flags:** `?t=<ms>&freeze=1` replays that many 60 Hz steps and draws once (`window.__frozen = true`, `<html data-state>`); `window.__advance(ms, noDraw)` steps further. `?seed=`, `?palette=harbour|highland|dusk|blossom`, `?yaw=`, `?pitch=`, `?zoom=`, `?shadows=off`.
- **Phones:** under 560 px the goal card shows the next goal only, stats and palette sit under it, the toolbar keeps 46 px buttons; the HUD is drawn at CSS size.
- **Text state:** `window.__state()` = the module's `state()` (counts, verifier, gull facing measured on the model) plus `scene`, `result`, `mode`, `auto`, `goals`, `cursor`, `gt`, `endT`.

## Structure (sections in the game script)

| # | section | what is in it |
|---|---|---|
| 1 | CONFIG | `MAP` rows (start island), `GOALS` (`{id, label, need, count(counts)}`), URL flags |
| 2 | EXTENSION POINTS | the `GAME` object (below) |
| 3 | TOWN | `makeTown()` creates the view; **`act(kind, x, z)`**: every change (player, toolbar, bot) goes through it; `afterEdit()` |
| 4 | GOALS & AUTOPLAY | `checkGoals()`, `botPlan()` / `botStep()` |
| 5 | INPUT | the input chain (keys, pointer, wheel, toolbar) |
| 6 | HUD | goal card, palette chips, stats, toolbar, cursor tag, banners, charter card; `HUDR` = the rects of the last frame |
| 7 | UPDATE & DRAW | `step()` at 60 Hz, `draw()` |
| 8 | BOOT | `GAME.boot()`: called by the last `<script>`, after the **ADDONS SLOT** `<script>` |

## Extension points

An addon is one object pushed onto `GAME.addons` **in the ADDONS SLOT** (the `<script>` right before `GAME.boot()`), so it sees the first frame and every `?t=` replay. Load addon modules with `<script src>` tags right above that slot (or paste them into it). Every member is optional:

```js
GAME.addons.push({
  onEdit(ev, game) {},          // (1) after every grow / shrink / undo / redo: {kind, x, z, from, to, changed: [{x, z}], counts}
  onGoal(goal, game) {},        // (2) a goal was completed: {id, label, need, index}
  update(game, { dt, t }) {},   // (3) every 60 Hz step; dt in ms (16.67)
  draw(ctx, game) {},           // (4) 2D overlay, effects layer: after the 3D view, before the HUD (CSS px)
  drawUI(ctx, game) {},         // (5) 2D overlay, top UI layer: after the HUD and banners, before the charter card
  scene3d(THREE, scene, game) {},// (6) after the 3D world is built (and on a new island): add 3D objects
  onKey(e, down, game) {},      // (7) first in the input chain; return true to consume
  onScene(scene, game) {}, onEnd(result, game) {}, onNewTown(game) {}   // (8)
});
GAME.builtinNotices = false;    // when your addon shows its own goal notices (the banner is skipped; onGoal still fires)
```

1. **Event site: `act(kind, x, z)` -> `afterEdit(ev)`.** Every change of the town (player click, key, toolbar, bot) goes through `GAME.act('grow' | 'shrink' | 'undo' | 'redo', x, z)`; the module calls back, `afterEdit` recounts, fires `onEdit(ev)` and checks the goals (`onGoal` fires once per goal, then `onEnd('charter')` once when all are done). Use `GAME.act` from addons too, never the town directly, so the scene follows.
2. **Clock:** `update` runs every fixed step (the bot, banners and the module's animation use only this clock; no wall clock) so `?t=` stills show your addon.
3. **Overlay canvas:** `ctx` is the 2D overlay in CSS px (`GAME.view = {w, h}`), already scaled to device pixels; the 3D view is drawn before it. `GAME.field = {x: 0, y: 0, w, h}` (the whole window).
4. **Anchors:** `GAME.anchorOf(x, z)` / `GAME.anchor('x,z')` -> `{x, y (top of the column), footX, footY, visible}` in CSS px, following the camera. There are no units: `GAME.unitRects()` is `[]` (gulls are scenery).
5. **UI rects:** `GAME.uiRects()` = goal card, palette chips, stats, toolbar, cursor tag, banner and charter card of the last frame (`{name, x, y, w, h}`, CSS px) plus rects registered with `GAME.setUIRect(name, rect)`.
6. **3D access:** `GAME.v` is the module view (`three()` -> `{THREE, scene, camera, renderer}`, `pick`, `anchorOf`, `orbit`, `setParams({palette})`, `state()`); `GAME.town` is the data town (`H(x, z)`, `tile(x, y, z)`, `counts()`, `verify()`, `serialize()`).
7. **Goals:** `GAME.goals` (read), `GAME.done[id]`, `GAME.result`, `GAME.scene`, `GAME.auto`; `GAME.notice(title, line)` shows a banner.
8. **Content (ADDONS SLOT, before boot):** `GAME.addTile(def)` (a new tile: `{id, slot: 'land' | 'ground' | 'storey' | 'roof', sides: 'ESWN', rotate, weight, minH, maxH, build(api, info)}`, see the module README), `GAME.addPair(a, b)` (two sockets that may touch), `GAME.allowAir(s)`, `GAME.addGoal({id, label, need, count: counts => n})` (`counts.extra[tileId]` counts your tiles). `GAME.shipped = {tiles, goals}` records what the starter itself ships (set before the slot runs).

### Adding a tile and its rules (the starter task's reference answer)

```js
// a hedge garden: socket 'h' may meet another hedge, grass, a house wall or the sea; never a lane, door, stair or arch
GAME.addPair('h', 'h'); GAME.addPair('h', 'g'); GAME.addPair('h', 'W'); GAME.addPair('h', 'w');
GAME.addTile({ id: 'hedge-garden', slot: 'land', sides: 'hhhh', rotate: false, weight: 1.6,
  build(api, info) {
    info.dirs.forEach(([dx, dz], d) => { if (info.nbId[d] === 'hedge-garden') return;      // hedge rows on the open sides
      const x0 = dx > 0 ? 0.34 : -0.46, x1 = dx < 0 ? -0.34 : 0.46, z0 = dz > 0 ? 0.34 : -0.46, z1 = dz < 0 ? -0.34 : 0.46;
      api.box(x0, 0, z0, x1, 0.16, z1, '#4f8f45'); });
    api.cyl(0, 0, 0, 0.05, 0.05, 0.1, '#9a8f80'); api.cyl(0, 0.1, 0, 0.13, 0.1, 0.05, '#b7ad9c');   // birdbath
  } });
GAME.addGoal({ id: 'hedges', label: 'Two hedge gardens', need: 2, count: c => (c.extra && c.extra['hedge-garden']) || 0 });
```

## Changing the game

- **Start island:** edit `MAP` (14 rows of 14 digits). **Goals:** edit `GOALS` or `GAME.addGoal`. **Look:** `params` in section 3 (`palette`, `yaw`, `pitch`, `zoom`, `shadows`, `gulls`).
- **Rule weights:** `GameDNA_WfcTown3D.setWeight('arch', 12)` in the ADDONS SLOT (before the town is created).
- **Self-check without a browser:** `node --check` a copy of the game script; trace one autoplay edit `botStep()` -> `act()` -> `GAME.v.grow()` -> `afterEdit()` -> `onEdit` -> `checkGoals()`; the town's `verify().ok` must stay true.
