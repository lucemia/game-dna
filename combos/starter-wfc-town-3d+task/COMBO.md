# Add one new tile type with its rules and one new goal to the Harbour Charter starter

`index.html` is a complete 3D town-builder game (three.js in `three.min.js`); build on it. `index.README.md` documents its extension points (ADDONS SLOT, `GAME.addTile`, `GAME.addPair`, `GAME.addGoal`, `onEdit`, `onGoal`); `wfc-town-3d.README.md` documents the module inside `index.html`, the socket rules and the tile format.

Add one new tile type and its adjacency rules to this town builder, through its documented extension points only (do not
edit the module or the game script above the ADDONS SLOT):
A land tile called "hedge-garden": a garden cell edged with clipped hedges and a small stone birdbath or fountain in the
middle. Its four sides use a new socket for "hedge" that may touch another hedge garden, plain grass, a house wall
(with windows) and the sea, and nothing else: never a lane, a door, a stair or an arch. Draw it in 3D with the module's
tile build helpers (hedge rows only on the sides that do not continue into another hedge garden). Give it a weight so
that a normal autoplay town ends with at least two of them, and add a goal "Two hedge gardens" to the charter.
Keep `?auto=1` (the bot still reaches Charter Granted), `?t=&freeze=1`, every key, the toolbar and undo / redo working.

Every new name is original (no real game, character, place or brand names).

## Rules

1. **Extension points only:** register everything in the ADDONS SLOT `<script>` of `index.html` with the calls the README describes. Never edit the module script block or the game script; outside the ADDONS SLOT the file is unchanged. Do not edit `three.min.js`.
2. **Data, not hacks:** plain data in the README's formats. No `Math.random`, clock or DOM in them.
3. **Keep everything working:** `?auto=1`, `?t=<ms>&freeze=1`, `?seed=`, every key and the touch buttons; the town must stay valid (no broken adjacency) after any edit.

## Self-check without a browser

- `node --check` your ADDONS SLOT script (copy it to a temp .js). Diff `index.html` against the original: only the ADDONS SLOT changed.
- Say how a player can see the new tile and goal.
