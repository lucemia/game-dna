# Add a new ranged unit class and one more enemy to the Terrace Skirmish starter

`index.html` is a complete 3D grid-tactics game (three.js, `three.min.js` next to it); build on it. `index.README.md` documents its extension points (read "Extension points", item 10 "Content", and "Changing the game"). Add, **through the extension points only**:

1. **A new unit class for the player side** with an original name and id (not one already in the game or in the README example): a ranged fighter whose attack reaches **exactly 2 tiles** (`rng: [2, 2]`, so it cannot hit adjacent foes and is never countered by melee). Register it with `GAME.addClass(id, {name, look, attack})`, using a built-in look that reads as ranged and the matching animation (`attack: 'arrow'` or `'bolt'`). Add **one player unit** of that class with `GAME.addUnit(...)`: original name, sensible stats (HP 18-26, ATK 10-13, DEF 2-4, MOV 4, JMP 2), on a free passable tile on the player's (west) side of the map.
2. **One more enemy** with `GAME.addUnit(...)`: side `'b'`, an original name and id, an existing enemy class (`brute` or `shaman`) or another class you add, on a free passable tile on the enemy's (east) side.

Every new name is original (no real game, character, place or brand names). Check tile passability against the `MAP` rows in the game script (heights, terrain `w` = water, props `T P r R` block) and the existing roster positions.

## Rules

1. **Extension points only:** call `GAME.addClass` / `GAME.addUnit` in the ADDONS SLOT `<script>` of `index.html` (it runs before `GAME.boot()`). Never edit the module script block or the game script; outside the ADDONS SLOT the file is unchanged. `three.min.js` stays next to `index.html`.
2. **Data, not hacks:** no `Math.random`, clock or DOM in your additions.
3. **Keep everything working:** `?auto=1` must still finish (VICTORY or DEFEAT, the balance may change), `?t=<ms>&freeze=1`, `window.__state()`, keys Q / E / T / F / R / P, mouse and touch.

## Checks

- `?auto=1` plays to an end with no console errors; your ranged unit walks, faces its target and shoots from exactly 2 tiles away (arrow or bolt), and is never shown attacking an adjacent foe; the new enemy appears, acts and can be defeated.
- Selecting your ranged unit shows a red strike fringe 2 tiles beyond its blue reach (no adjacent ring); its unit panel shows your class name and RNG 2.
- `window.__state()` lists both new units; while they walk `facesMove` is true and while they attack `facesTarget` is true.

## Self-check without a browser

- `node --check` your ADDONS SLOT script (copy it to a temp .js). Diff `index.html` against the original: only the ADDONS SLOT changed.
- For each new unit, say its tile and why that tile is passable and free (height, terrain char, prop char, no other unit there).
- Walk one shot of your unit: its ATK minus the target's DEF (or DEF / 2 if `magic`), plus the height bonus, at range 2.
- Say how a player can see each feature (which turn, which key).
