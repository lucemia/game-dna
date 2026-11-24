# Add one new racer and one new track to the Meadowlark Cup starter

`index.html` is a complete 3D kart racing game (three.js in `three.min.js`); build on it. `index.README.md` documents its extension points (ADDONS SLOT, adding karts and tracks, `GAME.shipped`); `kart-racer-3d.README.md` documents the module inside `index.html`, the track format and `checkTrack`.

Add one new racer and one new track to this game, through its documented extension points only (do not edit the
module or the game script above the ADDONS SLOT):
1. A racer called "Mossback": a moss-green kart with a cream accent and helmet, number 7, slightly faster but slower to
   accelerate than the others (speed about 1.03, acceleration about 0.96). It must start on the grid of every race.
2. A track called "Frostbite Pass" with a cold, dusky look (use the built-in `twilight` palette or your own palette),
   one jump ramp and at least one boost pad, raced as the third race of the cup after the two built-in tracks. It must
   pass the module's own track check.
Keep `?auto=1` (the computer still drives the whole cup to the final standings), `?t=&freeze=1`, every key and the
touch buttons working.

Every new name is original (no real game, character, place or brand names).

## Rules

1. **Extension points only:** register everything in the ADDONS SLOT `<script>` of `index.html` with the calls the README describes. Never edit the module script block or the game script; outside the ADDONS SLOT the file is unchanged. Do not edit `three.min.js`.
2. **Data, not hacks:** plain data in the README's formats. No `Math.random`, clock or DOM in them.
3. **Keep everything working:** `?auto=1` (the computer drives the whole cup to the final standings), `?t=<ms>&freeze=1`, `?seed=`, every key and the touch buttons; the new track must pass the module's own track check.

## Self-check without a browser

- `node --check` your ADDONS SLOT script (copy it to a temp .js). Diff `index.html` against the original: only the ADDONS SLOT changed.
- Say how a player can see the new racer and the new track.
