# Add enemy threat range to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `threat-range.js` (one global, `GameDNA_ThreatRange`), API reference `threat-range.README.md`

README example names are placeholders.

## Shared premises

1. **Include each module file verbatim; never edit it.** Load it with its own `<script src>` before the game's script, or paste it unchanged into its own `<script>` tag. If a module seems to need a change, adapt my game around it and tell me.
2. **Resolution:** keep my game's native resolution and integer scaling as they are. Call module draw functions on my 2D context inside the same transform as my sprites (one module pixel = one game pixel), and keep my game's own image-smoothing setting (off for pixel art, on for smooth or HD games; never switch it).
3. **Time:** drive every module from one fixed 60 Hz step (1000 / 60 ms). If my loop uses variable delta time, accumulate it and run whole steps (at most 250 ms per frame). Turn/phase logic stays mine; modules still update every step to animate.
4. **Coordinates:** native screen pixels (world minus camera) unless a section says tiles.
5. **Art and names:** anything new you draw or name is original (no real game, character, place or brand names); English UI text; do not restyle my game.
6. **Hook, don't replace:** add calls or change bodies; never delete or rename a function.
7. **Keep every other caller working.** Find every caller and reader of what you change (turn order, input, moves, menus, HUD): autopilot/AI, test hooks, URL parameters such as `?auto=1`, `?t=` and `?freeze=1`, keyboard shortcuts, end-turn buttons. Update each one. My game's own autoplay must still finish a whole game. Keep existing HUD info (HP bars, max HP) and existing commands.

## Order of work

1. **Read the game first.** Write down (file, function) where these live: loop/update step; draw pass and its order (background, actors, effects, HUD); input; where damage/HP changes are applied; where turns, actions or selections are chosen and played; HUD windows and their rects; camera; battle/scene start and end; and every caller from premise 7.
2. **Check the prerequisites** below against those notes. If one is missing, add the smallest working version and tell me.
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Enemy threat range [ui].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Enemy threat range:** a tile grid; terrain per tile; unit on a tile (occupant), each unit's tile, move points and weapon range; the list of enemy units; a camera offset; a draw slot between ground and units; optional: the player's currently shown range tiles, sprite and HUD rects to keep clear, a key handler and pointer clicks.

## Element 1: Enemy threat range (`threat-range.js`, `GameDNA_ThreatRange`)

One key (default T) or a small THREAT button paints every tile any enemy could move to or strike this turn as a red tinted zone with a crisp marching outline. Pointing at one enemy shows only its reach; confirming on an enemy pins it (pins add up). The zone is recomputed by itself whenever a unit changes tile, uses the game's own move costs and blocking, and is drawn outline-only while the player's own range is on screen, so the blue range is never tinted.

**Parameters chosen:** `tint` = red, `fill` = 0.8, `pattern` = solid, `outline` = march, `march` = 8, `dash` = 4, `fade` = 120, `both` = outline, `walls` = hide, `costs` = on, `start` = off, `key` = KeyT, `label` = THREAT, `layer` = under, `button` = auto.

**Where it goes** (by role; find these places in my game):

1. *Once, after the map, units and canvas exist, before the first frame and before any `?t=` fast-forward:* `threat = GameDNA_ThreatRange.create({cols, rows, tile, view, params: {tint: 'red', fill: 0.8, pattern: 'solid', outline: 'march', march: 8, dash: 4, fade: 120, both: 'outline', walls: 'hide', costs: 'on', start: 'off', key: 'KeyT', label: 'THREAT', layer: 'under', button: 'auto'}, cost, occupant, enemies, posOf, moveOf, rangeOf, playerRange, getObstacles, uiRects})`. `view` = the map viewport in canvas px `{x, y, w, h}` (above the HUD). `cost(x, y, unit)` and `occupant(x, y)` are the functions the movement rules use (impassable = Infinity or 99). `enemies()` = the enemy side's units. `posOf(u)` = its TILE, `moveOf(u)` its move stat, `rangeOf(u)` = `[min, max]` attack distance. `playerRange()` = the tiles the game's own blue move overlay shows right now, or `null`. `getObstacles()` = sprite rects, `uiRects()` = HUD and window rects (not the map cursor, or the button flees the pointer), both in canvas px. The module computes nothing until the first `update`, so these may use state the game creates later.
2. *Your fixed update step, every step on every scene (also enemy phase and animations):* `threat.showUnit(<living enemy under the cursor while no player unit is selected, else null>)`, then `threat.update(<step ms>)` (`0` while the world is frozen).
3. *Your map draw pass:* ground -> your blue/red range overlay -> `threat.draw(ctx, cam)` -> units -> cursor -> HUD -> `threat.drawButton(ctx)`. `cam` = the map scroll `{x, y}` in px (or `{x: 0, y: 0}`). If the only slot is after units, use `layer: 'over'` and pass the sprite rects: the zone is then cut around them.
4. *Your keydown / keyup handlers and pointer handler:* keydown, first line: `if (threat.key(e.code, true, e.repeat)) { e.preventDefault(); return; }`; keyup: `threat.key(e.code, false)`. Pointer, in native px, before your own tap logic: `if (threat.click(x, y)) return;`. Where confirming on an enemy does nothing today: `threat.toggleUnit(enemy)` (pin).
5. *Where a battle starts or restarts:* `threat.clear()`.

**Common mistakes** (symptom -> fix):

- The zone ignores forest or hills -> `cost` is not the function the movement rules use.
- The zone passes through the player's units -> `occupant` does not return units, or both sides look like friends (give `isEnemy`).
- The zone stays where an enemy was -> `update` is not called on that scene; call it every step.
- Units are tinted red -> `draw` runs after units with `layer: under`; move it before units or use `layer: over` with sprite rects.
- The blue move range turns red -> `playerRange()` is missing; return the tiles the overlay shows and draw the zone after it.
- T does something else too, or an old shortcut died -> `threat.key` goes first and only returns true for its own key; keep your handler in the else path.
- The zone is offset -> pass the map scroll as `cam`, keep `view` in canvas px, do not translate the context as well.
- No zone in `?t=&freeze=1` shots -> the instance is created after the fast-forward, or `update` is outside that loop.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Enemy threat range] The toggle key or the THREAT button paints every tile enemies can reach or strike, with a marching dashed outline; again hides it; the button lamp follows.
- [Enemy threat range] Cursor on one enemy shows only its reach; confirming on enemies pins them and the zones add up.
- [Enemy threat range] When an enemy (or a player unit that blocks a path) moves, the zone follows at once; holes and walls match the rules.
- [Enemy threat range] With a player unit selected its blue range stays fully blue and the zone is outline only.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `threat-range.js` sha256 `10fbc8e61b65042c...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Enemy threat range] List the six call sites (create, update, draw, drawButton, key/click, clear) and the functions behind `cost`, `occupant`, `moveOf`, `rangeOf`.
- [Enemy threat range] Walk one enemy move: its tile changes -> next `threat.update` recomputes -> `threat.draw` shows the new zone.
- [Enemy threat range] Worked example: move 4, range 1; east of it grass (cost 1), forest (2), grass: it stops on the forest (1 + 2 = 3) and the grass beyond (4) and strikes one more: the zone reaches 4 tiles east.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.
