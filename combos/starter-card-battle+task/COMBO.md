# Add one new card and one new foe to the Lantern Road starter

`index.html` is a complete card-battle game; build on it. `index.README.md` documents its extension points (read "Extension points", item 9 "Content", and "Adding a card and a foe"); `card-battle.README.md` documents the battle module inside `index.html` and the exact card, foe and status formats ("Content is data"). Add, **through the extension points only**:

1. **A new card** with an original name and id (not one already in the game or in the README examples). Cost 1, aimed at one foe (`target: 'enemy'`), type `attack`. Effects: deal damage AND apply one existing status (`burn`, `exposed` or `sapped`) to that foe. Its text uses `{damage}` so the live number shows (it turns green or red with statuses). Put 2 copies in the starting deck and add it to the reward pool. Pick an `art` key that fits (blade, guard, fire, frost, storm, root, light, magic, heart, speed).
2. **A new foe** with an original name and id (not the README's example foe). HP between 14 and 22 (a number or `[min, max]`). At least two moves: one that attacks with 2 or more hits, one that does something else (ward on itself, a status on the hero, or both); a `pattern` (list of move ids) so its intents are readable. A built-in `look` (`toad`, `wisp`, `brute`, `imp`, `thief`, `golem`, `slime`, `bat`) with its own `palette` colours, or your own `draw`. Add it to the FIRST stop (fight 0), next to the foes already there.

Every new name is original (no real game, character, place or brand names).

## Rules

1. **Extension points only:** register both in the ADDONS SLOT `<script>` of `index.html` with `GAME.addCard(id, def, {deck: 2, pool: true})` and `GAME.addEnemy(id, def, {fight: 0})`. Never edit `GameDNA_CardBattle` (the module script block) or the game script; outside the ADDONS SLOT the file is unchanged.
2. **Data, not hacks:** the card and the foe are plain table entries in the format the README describes (effects like `{do: 'damage', n: 5}`, `{do: 'status', id: 'sapped', n: 2}`, `{do: 'ward', n: 4, to: 'self'}`). No `Math.random`, clock or DOM in them.
3. **Keep everything working:** `?auto=1`, `?t=<ms>&freeze=1`, `?seed=`, `?speed=`, keys E (end turn) and P (autoplay), drag and tap play. The intent tags of your foe must show what it then does (the module computes them from your moves; do not fake them).

## Checks

- `?auto=1` still walks the whole road to THE ROAD IS LIT (or THE LANTERN GOES OUT) with no console errors; in the first fight your foe stands with the others, shows intent tags, acts, and can be defeated; your card appears in the hand, is played (by the bot too) and its status chip appears on the foe.
- `?t=6000&freeze=1` shows the first fight with your foe on screen.
- The reward screens can offer your card.

## Self-check without a browser

- `node --check` your ADDONS SLOT script (copy it to a temp .js). Diff `index.html` against the original: only the ADDONS SLOT changed.
- Read your foe's moves and say what its intent tag shows for each (glyphs and numbers), and walk one hit of your card: base damage n, +Might, x0.7 if the hero is Sapped, x1.3 if the foe is Exposed, rounded down; ward absorbs first.
- Say how a player can see each feature (which stop, which key).
