# Add one new gem, one hero skill and one enemy to the Shardbound starter

`index.html` is a complete match-3 battle game (art in `art/`); build on it. `index.README.md` documents its extension points (ADDONS SLOT, `addGem`, `addSkill`, `addHero`, `addEnemy`, `addStage`, `GAME.shipped`); `match3-battle.README.md` documents the module inside `index.html`.

Add one new gem type, one new hero skill and one new enemy to this game, through its documented extension points only (do
not edit the module or the game script above the ADDONS SLOT):
1. A gem called "Shade": violet, with its own silhouette (a shape no other gem uses, e.g. a triangle), spawning as often
   as the other gems; every Shade gem cleared strikes the targeted foe directly for about 3 damage (cascade bonus included).
2. A skill called "Thorn Volley" that becomes the Archer's skill instead of Arrow Rain: it charges with 14 Grove gems,
   hits every foe for 1.6x the Archer's attack and turns 4 random gems into Grove gems.
3. An enemy called "Ember Wisp": the wisp look recoloured orange, about 150 HP, attack 30, attacks every 2 turns, weak to
   Tide, throws orange bolts; it joins the first wave of the second stage (the Mirrormere Shore).
Keep `?auto=1` (the computer still finishes the journey), `?t=&freeze=1`, every key, the pointer swaps and both layouts working.

Every new name is original (no real game, character, place or brand names).

## Rules

1. **Extension points only:** register everything in the ADDONS SLOT `<script>` of `index.html` with the calls the README describes. Never edit the module script block or the game script; outside the ADDONS SLOT the file is unchanged. Do not edit the files in `art/`.
2. **Data, not hacks:** plain data in the README's formats. No `Math.random`, clock or DOM in them.
3. **Keep everything working:** `?auto=1` (the computer still finishes the journey), `?t=<ms>&freeze=1`, `?seed=`, every key, the pointer swaps and both layouts.

## Self-check without a browser

- `node --check` your ADDONS SLOT script (copy it to a temp .js). Diff `index.html` against the original: only the ADDONS SLOT changed.
- Say how a player can see the new gem, skill and enemy.
