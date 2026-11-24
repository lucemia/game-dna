# Add one new monster and one new item to the Hollowstair starter

`index.html` is a complete first-person dungeon crawler; build on it. `index.README.md` documents its extension points (ADDONS SLOT, the add calls, `GAME.shipped`); `raycast-dungeon.README.md` documents the module inside `index.html`.

Add one new monster and one new item to this game, through its documented extension points only (do not edit the module
or the game script above the ADDONS SLOT):
1. A monster called "Frost Bat": the bat look recoloured icy blue (body and wings), about 8 HP, attack 3, defence 0, 4 XP,
   fast (one and a half actions per turn) and a little erratic like the Cave Bat, found on floors 1-3 and about as common
   as the Gloom Slime.
2. An item called "Moon Draught": a pale blue flask lying on the floor that heals 20 HP at once when the hero walks onto it,
   found on every floor.
Keep `?auto=1` (the computer still finishes the run), `?t=&freeze=1`, every key, the taps and the touch buttons working.

Every new name is original (no real game, character, place or brand names).

## Rules

1. **Extension points only:** register everything in the ADDONS SLOT `<script>` of `index.html` with the calls the README describes. Never edit the module script block or the game script; outside the ADDONS SLOT the file is unchanged.
2. **Data, not hacks:** plain data in the README's formats (looks with `palette` ramps, not CSS filters or flat tints). No `Math.random`, clock or DOM in them.
3. **Keep everything working:** `?auto=1` (the computer still finishes the run), `?t=<ms>&freeze=1`, `?seed=`, every key, the taps and the touch buttons.

## Self-check without a browser

- `node --check` your ADDONS SLOT script (copy it to a temp .js). Diff `index.html` against the original: only the ADDONS SLOT changed.
- Say how a player can see the new monster and the new item.
