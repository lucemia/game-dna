# Add one weapon, one foe and one upgrade to The Long Vigil starter


`index.html` is a complete horde survival game; build on it. `index.README.md` documents its extension points (read "Extension points", item 9 "Content", and "Adding a weapon, a foe and an upgrade"); `horde-survival.README.md` documents the module inside `index.html` and the exact weapon, foe, upgrade and wave formats ("Content is data"). Add, **through the extension points only**:

1. **A new weapon** with an original name and id (not one already in the game or in the README examples), of a built-in kind (`orbit`, `nearest`, `pulse` or `lance`) or `custom` with `fire(api, w, lv)`, with at least 3 levels of stats, an `icon` (`bolt blades pulse lance boots heart magnet hourglass might ring leaf`) and a `color`. Give it from the start: `GAME.startWeapons.push(id)` (so the probe sees it fire in every run).
2. **A new foe** with an original name and id (not the README's example), `look` one of `slime imp wisp harpy cultist golem` (it is drawn with that painted sprite), a `gait` that fits the art (`hop`, `fly`, `float`, `glide`, `stomp`), its own `h`, `hp`, `speed`, `dmg`, `xp` and `move`; add it to the waves with `{mix: {from: 0, to: 200, weight: 2}}` so it appears from the first minute.
3. **A new upgrade** (passive) with an original name and id, `max` 3, `stat` one of `speed maxHp magnet haste might reach regen` with its `per`, or your own `apply(hero, level, api)`.

Every new name is original (no real game, character, place or brand names).

## Rules

1. **Extension points only:** register all three in the ADDONS SLOT `<script>` of `index.html` with `GAME.addWeapon(id, def)`, `GAME.addEnemy(id, def, {mix: ...})`, `GAME.addUpgrade(id, def)`. Never edit `GameDNA_HordeSurvival` (the module script block) or the game script; outside the ADDONS SLOT the file is unchanged.
2. **Data, not hacks:** plain table entries in the README's formats. No `Math.random`, clock or DOM in them (`api.rng()` in a custom weapon).
3. **Keep everything working:** `?auto=1`, `?t=<ms>&freeze=1`, `?seed=`, `?speed=`, P (autoplay), Z, arrows / WASD, drag and card taps.

## Checks

- `?auto=1` still plays a whole run to DAWN BREAKS or FALLEN with no console errors; your weapon fires from the first seconds; your foe walks in from off-screen and can be killed; your upgrade can appear on a level-up card and its slot shows in the HUD when taken.
- `?t=30000&freeze=1` shows your foe and your weapon's shots on screen.

## Self-check without a browser

- `node --check` your ADDONS SLOT script (copy it to a temp .js). Diff `index.html` against the original: only the ADDONS SLOT changed.
- Walk one hit of your weapon at level 1 on your foe at minute 1: foe HP = round(hp x 1.55), hits to kill = ceil(that / dmg).
- Say how a player can see each addition (when, where).
