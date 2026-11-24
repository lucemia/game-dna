# Add a 3D tactics battlefield to your grid game

Defaults: zoom = {{zoom}} (2), camStep = {{camStep}} (0), pitch = {{pitch}} (33), light = {{light}} (day), overlay = {{overlay}} (pulse), grid = {{grid}} (0.22), shadows = {{shadows}} (soft), unitHeight = {{unitHeight}} (0.95), jump = {{jump}} (2), climbCost = {{climbCost}} (1), walkMs = {{walkMs}} (250).

Replace my grid game's flat map with a 3D heightmap battlefield: terraces, a 90-degree turning camera with zoom, height-aware move / attack / threat ranges, a path arrow, and low-poly units that walk, hop, lunge, cast, flinch and fall, facing where they go or whom they hit. My game keeps its turns, stats, damage, AI and menus.

## Files

- `three.min.js` (three.js 0.149.0): load it with `<script src="three.min.js">` from the same folder. Never a CDN or another version.
- `tactics-grid-3d.js`: include it verbatim after three.js; do not rewrite it. API in its README.

## Steps

1. **Canvases:** put a WebGL `<canvas>` and a 2D overlay `<canvas>` stacked in one 16:9 box. Create once: `tg = GameDNA_TacticsGrid3D.create({canvas, overlay, view: {w: 960, h: 540}, map, units: () => living units, params: {zoom: {{zoom}}, camStep: {{camStep}}, pitch: {{pitch}}, light: '{{light}}', overlay: '{{overlay}}', grid: {{grid}}, shadows: '{{shadows}}', unitHeight: {{unitHeight}}, jump: {{jump}}, climbCost: {{climbCost}}, walkMs: {{walkMs}}}})`. Call `tg.resize(cssW, cssH, devicePixelRatio)` on load and resize.
2. **Map:** convert your map to rows: `heights` (digits 0-9, invent gentle terraces if you have none), `terrain` (`g` grass, `s` stone, `d` sand cost 2, `w` water), `props` (`T` tree, `P` pine, `r` rock, `R` ruin, `.`). Your tile x is x, your row is z. Keep your own blocking rules in sync (water and props block).
3. **Units:** `tg.addActor({id, side: 'a' | 'b', cls, x, z})` for each unit; `cls` is knight, lancer, archer, brute or shaman (pick the closest look). Units passed to rules need `x, z, side, mv, jump, rng: [min, max]`; add these fields as aliases, keep yours.
4. **Selection:** replace your range code with `reach = tg.reachOf(unit)`, `tg.setOverlay('move', reach.stops)`, `tg.setPath(tg.pathTo(reach, x, z))`, `tg.setCursor(x, z)`; enemy zones with `tg.setOverlay('threat', tg.threatOf(enemies))`. Map arrow keys through `tg.gridDirFromScreen(dx, dy)`; mouse through `tg.pickTile(px, py)` (logical px). Add Q / E for `tg.rotate(-1 / 1)` and +/- or the wheel for `tg.zoomBy`.
5. **Actions:** move with `tg.walk(id, path, {onDone})` and write the new tile in `onDone`; attack with `tg.attack(att, def, {onImpact, onDone})` and run YOUR existing damage function inside `onImpact`, then `tg.hurt(def, att)` or `tg.defeat(def)`. Your AI and autoplay must wait for `onDone` (or `!tg.busy()`) before the next action.
6. **Loop:** in your fixed step call `tg.update(dtMs)` (0 while paused); each frame `tg.render()`, then draw your HUD and HP bars on `tg.overlayContext()` using `tg.anchorOf(id)`.
7. **State:** expose `window.__state = () => tg.state()` merged with your HP.

Keep autoplay, replay / `?t=` modes, restart, shortcuts and win / lose working; never delete a helper something still calls.

## Self-check without a browser

- `node --check` your script; every id passed to `tg` exists; every spawn tile is passable.
- Trace one move (select -> reachOf -> walk -> onDone -> your tile write) and one attack (attack -> onImpact -> your damage -> hurt / defeat -> onDone -> next turn).
- Worked example: a step from height 1 to 3 costs terrain 1 + 2 x {{climbCost}}; with jump {{jump}} a 3-level climb is impossible.

## Acceptance checks

- Autoplay still finishes with the same winner; no console errors.
- In `tg.state()`, every walking unit has `facesMove: true`, every attacker `facesTarget: true`, every standing unit `feetOk: true`.
- The camera turns and zooms; arrows still move the cursor the way the screen shows.
