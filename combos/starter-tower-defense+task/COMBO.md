# Add one new tower and one new enemy to the Thornwall Watch starter

`index.html` is a complete tower-defense game; build on it. `index.README.md` documents its extension points (read "Extension points" and "Adding a tower and an enemy"); `tower-defense.README.md` documents the tower-defense module inside `index.html` and the exact tower, enemy and wave formats.

Add one new tower type and one new enemy type to this game, through its documented extension points only (do not edit
the module or the game script above the ADDONS SLOT):
1. A tower called "Thorn Spitter": single target, ground only, heavy and slow (about 30 damage, 0.9 shots per second,
   range 2.2 cells), three levels, priced between the Bolt Tower and the Ember Mortar. It must appear in the build menu
   with its own number key, be buildable, upgradable and sellable like the others.
2. An enemy called "Ember Mite": a fast orange beetle (about 70 HP, speed 1.4, armour 1, reward 5) that marches in wave 3
   of the first field (six of them), and shows in that wave's preview.
Keep `?auto=1` (the computer still holds both fields), `?t=&freeze=1`, every key and the touch buttons working.

Every new name is original (no real game, character, place or brand names).

## Rules

1. **Extension points only:** register both in the ADDONS SLOT `<script>` of `index.html` with the `GAME.addTower` / `GAME.addEnemy` / `GAME.addWave` calls the README describes. Never edit the module script block or the game script; outside the ADDONS SLOT the file is unchanged.
2. **Data, not hacks:** the tower and the enemy are plain data in the format the README describes. No `Math.random`, clock or DOM in them.
3. **Keep everything working:** `?auto=1`, `?t=<ms>&freeze=1`, `?seed=`, every key and the touch buttons.

## Checks

- `?auto=1` still holds both fields with no console errors; in wave 3 of the first field six Ember Mites march, and the computer builds the new tower once six towers stand.
- `?t=60000&freeze=1` shows wave 3 of the first field with the new enemy on the road and the new tower card in the panel.

## Self-check without a browser

- `node --check` your ADDONS SLOT script (copy it to a temp .js). Diff `index.html` against the original: only the ADDONS SLOT changed.
- Say how a player can see each feature (which field, which wave, which key).
