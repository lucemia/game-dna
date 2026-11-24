# Add a wave-collapse town builder to this game

You are adding a cosy 3D town builder to an existing browser game. You get `wfc-town-3d.js` (global `GameDNA_WfcTown3D`), its `README.md`, and `three.min.js` (three.js 0.149.0). The player only raises or lowers grid cells (sea, land, a house, more storeys); the module chooses every wall, door, window, balcony, lane, roof, stair and gate arch from socket rules by wave function collapse, and draws the 3D scene. Read the README first.

## Steps

1. **Files.** Put `three.min.js` and `wfc-town-3d.js` next to the page, unchanged, and load them with plain `<script src>` tags in that order, before your game script. No CDN, no bundler.
2. **Where it lives.** Decide which part of the game becomes the builder (a town screen, a base, the whole game). Give it a WebGL `<canvas>`, your 2D HUD canvas stacked on top.
3. **Create once** when that screen starts: `town = GameDNA_WfcTown3D.create({canvas, overlay: hudCanvas, w, d, maxH, seed, heights: rows, params: {palette, pitch, zoom, shadows}, onEdit})`. `heights` are rows of digits: 0 sea, 1 land, 2 a one-storey house, 3 two storeys. Use a fixed seed. Call `town.resize(cssWidth, cssHeight, devicePixelRatio)` now and on every window resize.
4. **Fixed step.** In the loop that steps your game at a fixed rate (including any fast-forward or test replay), call `town.update(stepMs)` once per step; pass `0` while the game is paused. Never drive animation from the render loop.
5. **Draw.** `town.render()`, then draw your HUD on the overlay: `const ctx = town.overlayContext()` (cleared, in CSS px), or on your own canvas.
6. **Input.** Pointer: convert to CSS px of the canvas, `const c = town.pick(x, y)`; on hover `town.setHover(c, mode)`; on click `town.grow(c.x, c.z)` or `town.shrink(c.x, c.z)`. A drag of more than about 8 px orbits instead (`town.orbit(-dx * 0.35)`, `town.setPitch(...)`); the wheel zooms (`town.zoomBy`). Keys: map arrows with `town.gridDirFromScreen(dx, dy)` to move a cursor cell, a confirm key grows it, another lowers it; add undo / redo (`town.undo()`, `town.redo()`) and camera turns. Add on-screen buttons for touch.
7. **Game hooks.** In `onEdit(info)` read `town.town.counts()` (houses, doors, arches, stairs...) and connect them to the game you have: goals, unlocks, score, quests, sounds. An autoplay builds through the player's calls.
8. **Look.** Pick a palette (`harbour`, `highland`, `dusk`, `blossom`) that suits the game. Keep the HUD off the middle of the island and readable on a 390 px phone.

## Rules

- Never place or change tiles yourself, never re-create the town per click, never call `resolveAll()` per edit: only change heights through `grow`, `shrink`, `set`, `undo`, `redo`.
- Undo must give back exactly the previous town (the module's `undo()` does; do not re-solve).
- Same seed + same edits = same town; use no `Math.random` in anything that changes the town.
- To add a new kind of tile, use `registerTile` with its sockets and `registerPair` for the sockets it may touch, before the town is created (README, "Extending the rules").
- `town.town.verify().ok` stays `true` after every edit.
- Keep every existing control, screen, test flag and autoplay of the game working.

## Done when

- Clicking cells grows the island and houses; doors open onto lanes, roofs join, an arch appears between two houses with a lane through, stairs climb onto flat terraces.
- Hover shows the ghost of the next storey; undo and redo step back and forth exactly.
- The camera orbits and zooms; it works on a phone.
- The game's own goals, saves or autoplay still work and react to the town.
