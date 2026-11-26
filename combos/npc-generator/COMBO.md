# Add npc generator to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `npc-generator.js` (one global, `GameDNA_NpcGen`), API reference `npc-generator.README.md`

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) NPC generator [actor].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **NPC generator:** a walkable area and the game's own solid test for one world point; the fixed update step (also the ?t= fast-forward) for town.update(dt, hero feet); a camera offset; the talk key, checked after the game's own targets; the always-on HUD boxes on screen, so the talk panel keeps clear of them.

## Element 1: NPC generator (`npc-generator.js`, `GameDNA_NpcGen`)

NPC generator: seeded townsfolk from parts (age, build, skin, hair, clothes, hats, glasses, beards) in one pixel style with a 4-direction walk, a name and a trade; same seed = same people; a town helper makes them wander round walls and props, make way for the hero and face whoever talks to them; a talk opens a dialogue panel at the bottom (or top) of the view with their own pixel portrait, clear of the HUD.

**Parameters chosen:** `seed` = 7, `count` = 6, `speed` = 22, `scale` = 1.

**Where it goes** (by role; find these places in my game):

1. *Every new game (also restart):* `town = GameDNA_NpcGen.town({seed: 7, count: 6, speed: 22, scale: 1, area: {x, y, w, h} /* world px of a village or square */, blocked: (x, y) => /* the game's solid test for ONE world point */})`.
2. *The fixed step (also the ?t= replay), only while the world runs:* `town.update(STEP_MS, {x: heroFeetX, y: heroFeetY})`.
3. *The world draw, inside its depth sort:* `for (const d of town.drawables(camX, camY)) list.push({y: d.y, draw: () => d.draw(ctx)})` (pass `0, 0` if the canvas is already translated by the camera).
4. *The talk key, after the game's own targets:* `if (town.talking()) town.release(); else { const f = town.nearest(heroFeetX, heroFeetY, ~1.5 tiles); if (f) town.talk(f, {x: heroFeetX, y: heroFeetY}); }` (do not open the game's own dialogue box for townsfolk; walking ~3 tiles away also ends the talk).
5. *Every frame after the world, in screen space, before menus and windows:* `town.panel(ctx, camX, camY, {view: {x: 0, y: 0, w: VIEW_W, h: VIEW_H}, avoid: hudRects})` with screen = world - cam (a map drawn 16 px lower: `camY = camera.y - 16`) and `hudRects` = the always-on HUD boxes in screen px (array or function).

**Common mistakes** (symptom -> fix):

- Townsfolk inside houses or props -> `blocked` tested tiles or screen px instead of world points.
- `?auto=1` ends differently -> townsfolk were made solid or the talk key now talks instead of the old action; keep them out of collision and check them last.
- Doubled camera offset -> the canvas is already translated: pass 0, 0.
- Frozen townsfolk -> `town.update` not in the fixed step.
- Created per frame -> make the town once per game, not in draw.
- Panel on the HUD or on the wrong side -> `avoid` misses HUD boxes, or the camera passed to `panel` lacks the HUD offset.
- Two dialogue boxes -> the game's own dialogue was also opened for a townsperson; the panel replaces it.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [NPC generator] 6 different-looking people walk in four directions with stepping feet, never inside walls or props, and step round each other and the hero.
- [NPC generator] The talk key next to one stops it; it turns to the hero; a marker over its head and the panel with its portrait, name, trade and line, inside the view and clear of the HUD; the key again (or walking away) closes it and it walks again.
- [NPC generator] The same seed gives the same people after a reload; `?auto=1` ends as before with no console errors.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `npc-generator.js` sha256 `5b616070c70dc966...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [NPC generator] One worked example: world (200, 150), camera (64, 40) -> drawn at (136, 110).
- [NPC generator] Every old use of the talk key still reaches its target first.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.
