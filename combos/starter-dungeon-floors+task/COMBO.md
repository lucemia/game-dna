# Add one room type, one monster and one item to the Lanternfall starter

`index.html` is a complete dungeon game; build on it. `index.README.md` documents its extension points (ADDONS SLOT, `GAME.addRoom`, `GAME.addMonster`, `GAME.addItem`); `dungeon-floors.README.md` documents the module inside `index.html` and the exact room, monster and item formats.

Add one new room type, one new monster and one new item to this game, through its documented extension points only (do
not edit the module or the game script above the ADDONS SLOT):
1. A room type called "Fungal Grotto": mossy floor, glowing mushrooms as decor, a cool green torch light, a normal monster
   budget and a fair chance of a chest. It should turn up on most floors (give it a weight a little above the Hall's).
2. A monster called "Cave Toad": a hopping olive-green creature (it may reuse a built-in hopping look with its own
   colours) with about 11 HP, attack 3, defence 0, 4 XP, normal speed, found on floors 1-3 and placed by the room budgets.
3. An item called "Glow Cap": a pale green tonic-like pick-up that heals 8 HP at once, found in chests and lying on floors.
Keep `?auto=1` (the computer still finishes the run), `?t=&freeze=1`, every key and the touch buttons working.

Every new name is original (no real game, character, place or brand names).

## Rules

1. **Extension points only:** register all three in the ADDONS SLOT `<script>` of `index.html` with the calls the README describes. Never edit the module script block or the game script; outside the ADDONS SLOT the file is unchanged.
2. **Data, not hacks:** plain data in the README's formats. No `Math.random`, clock or DOM in them.
3. **Keep everything working:** `?auto=1`, `?t=<ms>&freeze=1`, `?seed=`, every key and the touch buttons.

## Self-check without a browser

- `node --check` your ADDONS SLOT script (copy it to a temp .js). Diff `index.html` against the original: only the ADDONS SLOT changed.
- Say how a player can see each addition (which floor, where).
