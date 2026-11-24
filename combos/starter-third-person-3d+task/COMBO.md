# Add a waving villager and a berry collection to the Sunshard Isle starter

`index.html` is a complete third-person 3D game (three.js 0.149.0 in `three.min.js`, keep it next to the page); build on it. `index.README.md` documents its extension points (read "Extension points"); `third-person-3d.README.md` documents the 3D module inside `index.html`. Add, **through the extension points only**:

1. **A second NPC** with an original name (not "Keeper"): a villager (`look: {base: 'villager'}`, you may change its colours) standing somewhere open on the island, at least 3 m from every shard, from the Keeper and from the dirt paths, so it never blocks anyone. While the hero is within 4 m it turns to face the hero and **waves** (`play('wave')`) for as long as the hero stays near; when the hero walks away it stops waving. Space within talking range opens a dialog with 2 lines of your own; one line mentions how many berries the hero has found.
2. **A berry collection**: 5 collectible berries (pickups with a kind other than `'shard'` and a red or purple colour) spread over the island in open spots you can reach on foot, and a **counter** on screen "BERRIES n / 5" in the same panel style as the sun-shard panel, placed so it never overlaps the existing HUD, dialog or touch controls (use `GAME.uiRects()`). Each berry counts exactly once; berries never count as sun shards. When all 5 are found show a toast.

Every new name is original (no real game, character, place or brand names).

## Rules

1. **Extension points only:** everything goes in the ADDONS SLOT `<script>` of `index.html` (`GAME.addNPC`, `GAME.addPickup`, `GAME.addons.push({...})` hooks such as `onPickup`, `onStep`, `draw(g, layer)`). Never edit the module script block or the game script; outside the ADDONS SLOT the file is unchanged.
2. **3D rules:** anything you add that faces a direction uses `yaw = Math.atan2(v.x, v.z) + GameDNA_ThirdPerson3D.FACING_OFFSET`; never move the hero by writing its position; no `Math.random` or clock reads in step hooks (the game is deterministic for `?t=&freeze=1`).
3. **Keep everything working:** `?auto=1` still collects the three shards, talks to the Keeper and reaches the end screen; `?t=<ms>&freeze=1`, `?palette=`, `?gear=`, keys (WASD, Shift, Q/E, Space, P, Esc), mouse drag and the touch stick.

## Checks

- `?auto=1` reaches "THE BEACON BURNS" with no console errors.
- Walk to your villager: it faces the hero and waves; walk away: it stops. Talk to it: two lines, one with the berry count.
- Pick up berries: the counter goes up by one each, the shard counter does not change; at 5 the toast shows.
- `window.__state()` still lists the hero with `facesMove: true` while it moves and every actor (yours too) with `feetY` within 0.01.

## Self-check without a browser

- `node --check` your ADDONS SLOT script (copy it to a temp .js). Diff `index.html` against the original: only the ADDONS SLOT changed.
- For each berry and the villager, compute the distance to every shard, to the Keeper (2.7, -8.4) and to the path points in `PATHS`, and say it is at least 3 m (berries: at least 1.5 m from props in `LAYOUT`).
- Say how a player can see each feature.
