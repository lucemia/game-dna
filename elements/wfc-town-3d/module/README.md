# wfc-town-3d.js (N-06 module, v1.1.0)

v1.1.0 (strict critic r1): paving under every house (no sea through ground seams), darker arch vault with bevelled voussoirs and a free keystone, matte sea (no sun hotspot) and a dithered sky, colours per building (cells joined at the same height), lit lanterns, clean stair profiles, stronger pop, finer gulls, portrait framing (`params.portraitShift`, default 0.1).

One plain classic script, ASCII only, no `import`/`export`. It defines one global, `GameDNA_WfcTown3D`. Load `three.min.js` (three.js **0.149.0**, the file next to the page; never a CDN) first, then this file, unchanged. It is a cosy town builder on a grid: the player raises cells (sea -> land -> a house -> more storeys) and every wall, door, window, balcony, arch, stair and roof is chosen by a wave-function-collapse solver from the neighbours.

Two layers:

- **`createTown(opts)`**: pure data, no DOM, no three.js (runs in node). Column heights, the socket rules, the solver, exact undo / redo, an exhaustive verifier, counts.
- **`create(opts)`**: the three.js view of a town: island slabs with grass lips, shore rocks and foam, lanes with cobbles and lamps, trees, wells and flowers on gardens, houses with plinths, cornices, corner pilasters, shuttered / arched / flower-box windows, shop fronts with striped awnings, doors with lanterns, balconies, gate arches with a vaulted passage, stone stairs, gable / hip / flat-terrace / turret roofs with chimneys, parasols and laundry, a sea with moving ripples, a sky gradient, fog, one soft-shadowed sun, gulls, an orbit camera, picking, a hover ghost, pop and dust on each edit, four palettes and a 2D fallback map when WebGL is missing.

## How the wave collapse works

- A cell's **height** `H` is the only thing the player sets: `0` sea, `1` land, `H >= 2` a house with `H - 1` storeys. Each cell owns `max(1, H)` **slots** stacked up: `water`, `land`, `ground` (the ground storey), `storey`, `roof` (the top slot of a house).
- Every **tile** in a slot has a socket on each side (E S W N), an `up` and a `down` socket. Sockets (one letter): `w` sea, `g` grass, `p` a lane crosses this edge, `u` a stair rises toward this edge, `b` joined to the next storey of the same block, `W` wall with windows, `D` door, `K` balcony, `S` plain wall a stair lands on, `A` arch opening, `e` eave, `r` ridge continues, `n` gable end, `f` terrace parapet, `c` free-standing turret. Up / down: `t` / `T` storey on storey, `h` an arch needs a storey above, `F` / `L` a stair landing needs a flat roof above, `R` sloped roof.
- Two sides may touch only when their pair is in the rule table (`ww wg wW gg pp gW pD pA uS bb AA rr ee ff nn nf ef en We Wn Wf`); a side facing open air must be in `W K e n f c`; the sea lies outside the grid. So a door needs a lane in front of it, a lane must continue or end, a ridge runs on into the next gable, a stair rises exactly one storey onto a flat roof, an arch has houses on both flanks, lanes at both ends and a storey above, a turret stands free.
- **Solve:** each slot starts with every tile its class allows; arc consistency (AC-3) removes tiles without a compatible neighbour; then the slot with the lowest weighted entropy collapses (seeded noise breaks ties) to a weighted random tile and the change propagates, until every slot holds one tile.
- **Edit:** only the slots within `radius` (2) cells of the edited cell are re-solved; every other slot keeps its tile, so the town does not reshuffle. On a contradiction the radius grows (4, 6), then the whole town is re-solved (6 seeds), then a guaranteed plain assignment is used (`stats().fallbacks`; 0 in all checks so far).
- **Deterministic:** the random stream of each solve is `hash(seed, edit serial, cell)`. The same seed and the same edit history give the same town, byte for byte. Cosmetic choices (wall colour, window style, trees) hash the cell and the seed only.
- **Undo / redo** store full snapshots (heights + every tile); undo gives back exactly the earlier town, it never re-solves.

## `GameDNA_WfcTown3D.createTown(opts)` (data)

| option | meaning |
|---|---|
| `w`, `d` | grid size (3-40, default 12) |
| `maxH` | highest column (2-8, default 6): `maxH - 1` storeys |
| `heights` | rows of digits (`'0011210'`) or a flat array, row = z, char = x |
| `seed` | integer; tile choices and looks |
| `radius` | re-solve radius around an edit (default 2) |
| `maxUndo` | snapshots kept (default 400) |

Town members: `grow(x, z)`, `shrink(x, z)`, `set(x, z, h)` -> `{kind, x, z, from, to, serial, radius, fallback, changed: [{x, z}]}` or `null` (no change); `undo()`, `redo()`, `canUndo()`, `canRedo()`, `load(rows)` (replace the map, clears history), `resolveAll()`; `H(x, z)` (-1 outside), `tile(x, y, z)` -> `{id, s: 'ESWN', up, dn}`, `column(x, z)`, `slots()`, `heights()`, `serialize()` (heights + every tile: compare two towns with it), `verify()` -> `{ok, checked, violations}` (every side, top and bottom of every slot), `counts()` -> `{land, houses, storeys, tallest, doors, windows, balconies, arches, stairs, paths, turrets, gables, hips, flats, extra: {tileId: n}}`, `stats()`, `rules()`.

Tile ids: `water`, `grass`, `path`, `land-stair`, `house`, `arch`, `storey`, `roof-gable`, `roof-hip`, `roof-flat`, `roof-stair`, `roof-turret`.

## `GameDNA_WfcTown3D.create(opts)` (3D view)

Same options as `createTown` (or `town:` an existing town), plus:

| option | meaning |
|---|---|
| `canvas` | the WebGL `<canvas>`. Without WebGL the town still works and `overlay` shows a top-down map with a message; nothing throws |
| `overlay` | optional 2D `<canvas>` on top (your HUD). `overlayContext()` clears it and returns it scaled to CSS px |
| `params` | `palette` harbour / highland / dusk / blossom, `yaw` 45, `pitch` 36, `zoom` 1, `fov` 30, `shadows` soft / off, `quality` high / low (shadow map 2048 / 1024), `gulls` 3, `pop` on / off, `ghost` on / off, `grid` 0.22 (cell dots on the sea), `portraitShift` 0.1 (portrait screens: the view shifts down by this share of the height) |
| `onEdit(info)` | after every grow / shrink / set / undo / redo / load through the view |
| `THREE` | optional, else `window.THREE` |

View members: `update(dtMs)` once per fixed step (camera easing, sea, foam, pop, dust, gulls; `0` while frozen; deterministic), `render()`, `resize(cssW, cssH, dpr)`, `overlayContext()`; edits that also rebuild the scene: `grow`, `shrink`, `set`, `undo`, `redo`, `load(rows)`, `resolveAll()` (after `setWeight`); camera `orbit(dDeg)`, `setYaw`, `setPitch`, `zoomBy`, `setZoom`, `camera3()`, `gridDirFromScreen(dx, dy)` (arrow keys -> grid step for the current yaw); `pick(px, py)` -> `{x, z, h}` (CSS px, the column under the pointer, roofs included); `setHover(cell, 'grow' | 'shrink')` (white ghost of the storey a click adds, red of the one it removes); `anchorOf(x, z)` -> `{x, y, footX, footY, visible}` (CSS px, top of the column); `worldToScreen`, `cellWorld`; `setParams({...})`, `palettes()`, `palette()`; `three()` -> `{THREE, scene, camera, renderer}`, `scene()`; `state()`; `town`.

## Extending the rules

Call these before the town is created (they are global):

- `registerTile({id, slot, sides, rotate, weight, minH, maxH, up, down, build})`: `slot` = `land` / `ground` / `storey` / `roof`; `sides` = four sockets E S W N (`rotate: true` adds the 3 rotations); `weight` relative to the built-ins (grass 6, lane 0.12-0.55, gable 2.2, arch 9); `build(api, info)` draws it in cell-local units (origin = cell centre at the slot's floor; a storey is `api.STOREY` = 0.7 tall): `api.box(x0, y0, z0, x1, y1, z1, colour)`, `api.glass(...)`, `api.blob(x, y, z, r, colour)`, `api.cyl(x, y, z, r0, r1, h, colour)`, `api.tri(a, b, c, colour)`, `api.faceBox(side, u0, u1, h0, h1, o0, o1, colour)`, `api.rng()`; colours are `'#rrggbb'` or palette names (`grass`, `leaf`, `walls`, `roofs`, `trim`, `path`, `wood`, `rock`, `accent`, `glass`); `info = {x, z, y, H, sides, rot, wall, nbH: [4 neighbour heights], nbId: [4 neighbour tile ids at this level], dirs}`.
- `registerPair(a, b)`: sockets `a` and `b` may touch. `allowAir(s)`: `s` may face open air. `allowVertical(up, down)`.
- `setWeight(key, value)`: `grass path1 path2 path3 path4 landStair arch gable ridge hip flat roofStair turret` or a face socket `W D S K`.

Example (a hedge garden that never touches a lane or a door):

```js
GameDNA_WfcTown3D.registerPair('h', 'h'); GameDNA_WfcTown3D.registerPair('h', 'g');
GameDNA_WfcTown3D.registerPair('h', 'W'); GameDNA_WfcTown3D.registerPair('h', 'w');
GameDNA_WfcTown3D.registerTile({ id: 'hedge-garden', slot: 'land', sides: 'hhhh', rotate: false, weight: 1.6,
  build(api, info) { api.box(-0.46, 0, -0.46, 0.46, 0.16, -0.34, '#4f8f45'); api.blob(0, 0.12, 0, 0.12, '#4f8f45'); } });
```

## Facing (creatures)

The gulls are the only creatures. They are modelled beak on local +X (`FACING_OFFSET = -PI/2`); yaw for a flight vector `v` is `atan2(v.x, v.z) + FACING_OFFSET`. `state().actors[]` reads the forward from `getWorldDirection` of a nose marker inside the model: `facesMove` within 15 deg. They fly, so the feet rule does not apply.

## Text state

`state()` -> `{t, palette, camera, grid, heights, counts, verify: {ok, checked, violations}, serial, hover, last: {kind, x, z, from, to}, actors: [{id, kind, x, y, z, yaw, moveDir, forward, moveAngle, facesMove, flying}], webgl}`.

## Common mistakes

- The town reshuffles everywhere on each click -> you re-created the town or called `resolveAll()`; edit with `grow` / `shrink` / `set`.
- Different town on every reload -> pass a fixed `seed`; edit in the same order.
- Undo leaves a different roof than before -> you re-solved instead of calling `undo()`.
- Clicking hits the wrong cell -> pass CSS px of the canvas (not device px) to `pick`; call `resize` on load and resize.
- Nothing animates in a `?t=&freeze=1` still -> call `update(dt)` in the fixed step, not in the render loop.
- A new socket letter never appears -> it has no pair: `registerPair` it with the sockets it may touch (and `allowAir` if it can face the sky).
