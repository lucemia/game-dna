# Add a first-person raycast dungeon to my game

Parameters (defaults): floors {{floors}} = 3, size {{size}} = 15, rooms {{rooms}} = 4, doors {{doors}} = 0.5, density {{density}} = 1, fov {{fov}} = 76, fog {{fog}} = 0.24, lantern {{lantern}} = 4.5, minimap {{minimap}} = on, numbers {{numbers}} = on.

You get `raycast-dungeon.js` (one global, `GameDNA_RaycastDungeon`) and its README. Include the file **verbatim** (a `<script src>` tag, or pasted unchanged into a `<script>` block). Do not rewrite it. It owns a whole first-person grid crawl: seeded floors, turn rules, monster AI, the raycast 3D view, the sword, HUD, minimap, combat labels and a bot.

## Wire it in

1. **Mode.** The crawl becomes a mode of my game, entered where it starts a level. Keep every existing scene and menu.
2. **Create once, start per run:** `rd = GameDNA_RaycastDungeon.create({view: {x: 0, y: 0, w, h} (my logical canvas), seed, params: {floors: {{floors}}, size: {{size}}, rooms: {{rooms}}, doors: {{doors}}, density: {{density}}, fov: {{fov}}, fog: {{fog}}, lantern: {{lantern}}, minimap: '{{minimap}}', numbers: '{{numbers}}'}, onHit, onEvent, onEnd})`, then `rd.start({seed})` when the mode begins. Fixed seed, no `Math.random`.
3. **Every fixed update step** of my loop (also fast-forward loops): `rd.setHeld({up, down, left, right})` from my held keys, then `rd.update(stepMs)`; pass `0` while my world is paused.
4. **Draw:** `rd.drawScene(ctx)`, then my own effects, then `rd.drawUI(ctx)`, then my overlays. Smoothing off; a whole number of device pixels per logical pixel (logical width about 200 on phones, 420 on desktops) so the HUD text stays at least 10 CSS px tall.
5. **Input:** `rd.key(k)` with `'up'`, `'down'`, `'left'` / `'right'` (turn), `'strafeleft'` / `'straferight'`, `'attack'`, `'wait'`, `'potion'`, `'map'`. Taps: `rd.pointer('down', x, y)` in logical px. On phones show touch buttons for those keys. My autoplay: `rd.setAuto(true)`.
6. **Ends:** in `onEnd(result, info)` (`'win'` = the boss fell, `'lose'` = the hero fell) run my existing win / lose code exactly once.
7. **Hooks for the rest of my game:** `onHit(hit)` fires on each impact frame after HP changed (`hit.target`, `hit.amount`, `hit.crit`, `hit.miss`): effects only. The module draws combat labels beside each monster; if my game already draws numbers, pass `numbers: 'off'` and place mine with `rd.anchor(id)`, avoiding `rd.unitRects()` and `rd.uiRects()`, inside `rd.fieldRect()`.
8. **My content (optional):** monsters, items and hand-made floors as data: `rd.addEnemy(id, {name, look, palette, hp, atk, def, xp, speed, sight, weight, minFloor, maxFloor})`, `rd.addItem(id, {name, look, color, effect: {heal, gold, atk, def}})`, `rd.addMap(id, {floor, rows: [...]})`.

## Keep working

My autoplay, `?t=` / freeze modes, restart, pause, every existing key and touch control. Keep my HUD outside `rd.uiRects()`.

## Self-check without a browser

- Trace one run: start -> update every step -> key -> a step -> a strike -> `onHit` -> the monsters' turn -> the stair arch -> next floor (`floorStart`) -> `onEnd` once -> my end screen.
- Every loop that steps my game calls `rd.update` once per step; nothing I removed or renamed is still called.
- One worked example: hero attack 5 against a monster with defence 1 hits for 4 to 6 (a crit x1.5, rounded up).

## Acceptance checks

- Two loads with the same seed give the same floors and, under autoplay, the same run, at any window size.
- Walls stay straight when turning (no fisheye), no gaps between wall columns, monsters behind a corner are cut off by it.
- A hit monster flashes solid white, then shows its hurt pose; a miss shows MISS; labels never cover a monster, the sword or the HUD.
- My autoplay finishes a run with no console errors.
