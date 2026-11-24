# Add loot drops with rarity beams to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `loot-beams.js` (one global, `GameDNA_LootBeams`), API reference `loot-beams.README.md`

README example names are placeholders.

## Shared premises

1. **Include each module file verbatim; never edit it.** Load it with its own `<script src>` before the game's script, or paste it unchanged into its own `<script>` tag. If a module seems to need a change, adapt my game around it and tell me.
2. **Resolution:** keep my game's native resolution and integer scaling as they are. Call module draw functions on my 2D context inside the same transform as my sprites (one module pixel = one game pixel), and keep my game's own image-smoothing setting (off for pixel art, on for smooth or HD games; never switch it).
3. **Time:** drive every module from one fixed 60 Hz step (1000 / 60 ms). If my loop uses variable delta time, accumulate it and run whole steps (at most 250 ms per frame).
4. **Coordinates:** native screen pixels (world minus camera) unless a section says tiles.
5. **Art and names:** anything new you draw or name is original (no real game, character, place or brand names); English UI text; do not restyle my game.
6. **Hook, don't replace:** add calls or change bodies; never delete or rename a function.
7. **Keep every other caller working.** Find every caller and reader of what you change (turn order, input, moves, menus, HUD): autopilot/AI, test hooks, URL parameters such as `?auto=1`, `?t=` and `?freeze=1`, keyboard shortcuts, end-turn buttons. Update each one. My game's own autoplay must still finish a whole game. Keep existing HUD info (HP bars, max HP) and existing commands.

## Order of work

1. **Read the game first.** Write down (file, function) where these live: loop/update step; draw pass and its order (background, actors, effects, HUD); input; where damage/HP changes are applied; where turns, actions or selections are chosen and played; HUD windows and their rects; camera; battle/scene start and end; and every caller from premise 7.
2. **Check the prerequisites** below against those notes. If one is missing, add the smallest working version and tell me.
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Loot drops with rarity beams [fx].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Loot drops with rarity beams:** the game's wall / water test in world px (and its tile size), the map bounds; where foes die and chests open (a drop call, once each), and what the game already drops; a camera offset; a fixed update step (also run by the ?t= replay), update(0) while the world is stopped; a ground pass between floor and sprites, a pass after sprites, a tag pass before the HUD.

## Element 1: Loot drops with rarity beams (`loot-beams.js`, `GameDNA_LootBeams`)

Loot drops: defeated foes and opened chests throw items that arc with a shadow, bounce and settle on free ground (never in a wall, water or off the map), then show a rarity-coloured beam, outline and name tag; items in reach fly to the player on a clear line and are picked up exactly once (onPickup). Rarities, items and drop tables are data; tags never overlap each other or the HUD.

**Parameters chosen:** `magnet` = 56, `beams` = uncommon, `tags` = all, `distance` = 1, `bounce` = 1, `beamHeight` = 1, `render` = auto.

**Where it goes** (by role; find these places in my game):

1. *Once the map exists (before a ?t= fast-forward loop):* `loot = GameDNA_LootBeams.create({seed, scale: VIEW_H / 360, tile, solid, bounds, player, camera, view, uiRects, avoid, onPickup, params: {magnet: 56, beams: 'uncommon', tags: 'all', distance: 1, bounce: 1}})`. `solid(x, y)` = the game's wall / water test in WORLD px; `player()` = the player's feet `{x, y, h}`; `view` / `uiRects()` = the screen space the tag pass draws in (every HUD box and open window); `avoid()` = sprite boxes in world px.
2. *Where a foe dies / a chest opens (once):* `loot.drop(feetX, feetY, 'foe' | 'elite' | 'boss', {z: 12})` / `loot.drop(x, y, 'chest', {dx: 0, dy: 1, spread: 3})`. Drops the game already makes (coins, XP) become specs `[{item: 'gold', rarity: 'common', count}]` credited in `onPickup` (old pickup code removed, the game's random calls kept in order).
3. *The fixed step, every scene (also the ?t= replay):* `loot.update(worldRunning ? stepMs : 0)`.
4. *Render:* `loot.drawGround(ctx, camX, camY)` after the floor, before sprites; `loot.draw(ctx, camX, camY)` after sprites (0, 0 inside a camera translate); `loot.drawTags(ctx)` outside the camera translate, before the HUD.
5. *New game / restart; an autopilot that walked to drops:* `loot.clear()`; walk to `loot.list()` items with state `rest`.

**Common mistakes** (symptom -> fix):

- Loot in walls or water / at the map corner -> `solid` or drop points in screen px; world px, water included. `loot.audit()` must stay 0.
- Loot slides with the camera -> camera applied twice (inside a translate and as camX); pass 0, 0 inside the translate.
- Gold or XP counted twice -> the old pickup code still runs for the same drop.
- Never pulled in -> `player()` is the sprite top-left or screen px, or `update()` is not called in that scene.
- Tags on the HUD / a dialogue -> that box missing from `uiRects()`, or `uiRects` / `view` in another space than `drawTags`.
- Loot hangs in the air during a dialogue -> intended (update(0) while the world is stopped).
- `?auto=1` ends differently -> rewards now arrive on pickup (a little earlier with the magnet); keep them identical or report it.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Loot drops with rarity beams] A defeated foe throws items that arc, bounce and settle on open ground; none in a wall, water or off the map (`loot.audit()` 0).
- [Loot drops with rarity beams] Uncommon and better items show a beam in their colour; tags never overlap each other, the HUD or open windows.
- [Loot drops with rarity beams] Walking close pulls items in; each is credited once; `?auto=1` finishes with no console errors.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `loot-beams.js` sha256 `271bcaa7558ddd3f...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Loot drops with rarity beams] `solid`, `bounds`, drop points, `player`, `avoid` in world px; `view`, `uiRects`, `drawTags` in one screen space.
- [Loot drops with rarity beams] `drop` once per event; `update` once per fixed step in every scene; `clear()` on restart.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.
