# Add procedural dungeon floors to my game

Parameters (defaults): floors {{floors}} = 5, rooms {{rooms}} = 10, loops {{loops}} = 0.25, doors {{doors}} = 0.6, density {{density}} = 1, chests {{chests}} = 1, light {{light}} = 6.5, width {{width}} = 46, height {{height}} = 34, fog {{fog}} = on, minimap {{minimap}} = on, numbers {{numbers}} = on.

You get `dungeon-floors.js` (one global, `GameDNA_DungeonFloors`) and its README. Include the file **verbatim** (a `<script src>` tag, or pasted unchanged into a `<script>` block). Do not rewrite it. It owns a whole turn-based dungeon run: seeded floors, turn rules, monster AI, fog, all drawing (tiles, sprites, light, HUD) and a bot.

## Wire it in

1. **Mode.** The run becomes a mode of my game, entered where my game starts a level. Keep every existing scene and menu.
2. **Create once, start per run:** `df = GameDNA_DungeonFloors.create({view: {x: 0, y: 0, w, h} (my logical canvas), seed, params: {floors: {{floors}}, rooms: {{rooms}}, loops: {{loops}}, doors: {{doors}}, density: {{density}}, chests: {{chests}}, light: {{light}}, width: {{width}}, height: {{height}}, fog: '{{fog}}', minimap: '{{minimap}}', numbers: '{{numbers}}'}, onHit, onEvent, onEnd})`, then `df.start({seed})` when the mode begins. Use a fixed seed, never `Math.random`.
3. **Every fixed update step** of my loop (also fast-forward loops): `df.setHeld({up, down, left, right})` from my held keys, then `df.update(stepMs)`; pass `0` while my world is paused.
4. **Draw:** `df.drawScene(ctx)`, then my own effects, then `df.drawUI(ctx)`, then my overlays. Smoothing off; an integer number of device pixels per logical pixel (logical width about 220 on phones, 460 on desktops).
5. **Input:** map arrows/WASD to `'up' 'down' 'left' 'right'`, numpad 7 9 1 3 to `'upleft' 'upright' 'downleft' 'downright'`, Space to `'wait'`, Q to `'potion'`, M to `'map'`: `df.key(k)`. Taps: `df.pointer('down', x, y)` in logical px. My autoplay or attract mode: `df.setAuto(true)`.
6. **Ends:** in `onEnd(result, info)` (`'win'` = boss dead, `'lose'` = hero fell) run my existing win / lose code exactly once.
7. **Hooks for the rest of my game:** `onHit(hit)` fires on each impact frame after HP changed (`hit.target`, `hit.amount`, `hit.crit`, `hit.miss`): sounds, never HP changes. The module draws combat numbers; if my game already draws its own, pass `numbers: 'off'`.
8. **My content (optional):** my monsters, room types and items as data: `df.addMonster(id, {name, look, palette, hp, atk, def, xp, speed, sight, cost, minFloor})`, `df.addRoom(id, {...})`, `df.addItem(id, {...})`.

## Keep working

My autoplay, `?t=` / freeze modes, restart, pause, every existing key and touch control. Keep my HUD outside `df.uiRects()`.

## Self-check without a browser

- Trace one run: start -> update every step -> key -> a step -> a bump attack -> `onHit` -> stairs -> next floor (`floorStart`) -> `onEnd` once -> my end screen.
- Every loop that steps my game calls `df.update`; nothing calls it twice per step.
- Nothing I removed or renamed is still called.
- One worked example: hero attack 5 against a monster with defence 1 hits for 3 to 6.

## Acceptance checks

- Two loads with the same seed give the same floor and, under autoplay, the same run, at any window size.
- Every floor is connected, the stairs are reachable, no monster starts in the hero's room.
- The hero cannot cut a wall corner or walk through a closed door; bumping opens it.
- Unexplored cells are black, explored ones dim, monsters only appear in sight.
- My autoplay finishes a run with no console errors; HUD text never overlaps.
