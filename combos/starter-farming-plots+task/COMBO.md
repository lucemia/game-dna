# Add one new crop and one new tool to the Thistledown Acre starter

`index.html` is a complete farming game (art in `art/`); build on it. `index.README.md` documents its extension points (ADDONS SLOT, `addCrop`, `addTool`, `GAME.shipped`); `farming-plots.README.md` documents the module inside `index.html`.

Add one new crop and one new tool to this game, through its documented extension points only (do not edit the module or
the game script above the ADDONS SLOT):
1. A crop called "Sunflower": it grows in Summer and Fall, is ripe 3 watered nights after planting, shows 5 growth stages
   (seed, sprout, young, budding, a ripe golden bloom), seeds cost about 28 gold at the stall and a sunflower sells for
   about 80. Its ripe look must be golden yellow petals around a dark brown centre.
2. A tool called "Sprinkler Can": it waters the plot the farmer faces and the plots to its left and right in one use
   (three plots across), takes a little longer than the watering can, and sits on the next hotbar slot (key 5) with an
   icon that is clearly not the plain watering can (another colour).
Keep `?auto=1` (the computer still farms the whole year to the Harvest Fair), `?t=&freeze=1`, every key, tap-to-walk, the
phone layout and the HUD working.

Every new name is original (no real game, character, place or brand names).

## Rules

1. **Extension points only:** register everything in the ADDONS SLOT `<script>` of `index.html` with the calls the README describes. Never edit the module script block or the game script; outside the ADDONS SLOT the file is unchanged. Do not edit the files in `art/`.
2. **Data, not hacks:** plain data in the README's formats. No `Math.random`, clock or DOM in them.
3. **Keep everything working:** `?auto=1` (the computer still farms the year to the Harvest Fair), `?t=<ms>&freeze=1`, `?seed=`, every key and the pointer taps.

## Self-check without a browser

- `node --check` your ADDONS SLOT script (copy it to a temp .js). Diff `index.html` against the original: only the ADDONS SLOT changed.
- Say how a player can see the new crop and the new tool.
