// Basket hint for N-03 tactics-grid-3d: how to wire the module into an UNKNOWN game, by role, and the starter's extension points.
// Never name a host's functions here. {{key}} = parameter value chosen for this combo.
export default {
  stage: 'systems',
  does: 'Replaces the flat map view of a turn-based grid game with a three.js 0.149.0 heightmap battlefield: terraced tiles (grass, stone, sand, water) with trees, rocks and ruins; move / attack / threat ranges that respect height cost, jump and water; a path arrow over the terraces; a camera that turns in 90-degree steps and zooms; low-poly units that walk tile by tile, hop terraces, lunge, cast, flinch and fall, always facing their move or target. The game keeps turns, stats, damage and AI.',
  params: {
    zoom: 'create `params.zoom`', camStep: 'create `params.camStep`', pitch: 'create `params.pitch`', light: 'create `params.light`', overlay: 'create `params.overlay`',
    grid: 'create `params.grid`', shadows: 'create `params.shadows`', unitHeight: 'create `params.unitHeight`', jump: 'create `params.jump` (a unit\'s own jump wins)', climbCost: 'create `params.climbCost`', walkMs: 'create `params.walkMs`'
  },
  files: ['three.min.js'],
  steps: [
    ['Page', 'A WebGL `<canvas>` and a 2D overlay `<canvas>` stacked in one 16:9 box; `<script src="three.min.js">` (0.149.0, the file given, never a CDN) then the module, verbatim.'],
    ['Once, where your map starts', '`tg = GameDNA_TacticsGrid3D.create({canvas, overlay, view: {w: 960, h: 540}, map: {heights, terrain, props}, units: () => living units, params: {zoom: {{zoom}}, camStep: {{camStep}}, pitch: {{pitch}}, light: \'{{light}}\', overlay: \'{{overlay}}\', grid: {{grid}}, shadows: \'{{shadows}}\', unitHeight: {{unitHeight}}, jump: {{jump}}, climbCost: {{climbCost}}, walkMs: {{walkMs}}}})`, `tg.resize(cssW, cssH, devicePixelRatio)`, and `tg.addActor({id, side, cls, x, z})` per unit (cls knight / lancer / archer / brute / shaman).'],
    ['Your selection and range code', '`reach = tg.reachOf(unit)` (unit has `x, z, side, mv, jump, rng`), `tg.setOverlay(\'move\', reach.stops)`, path `tg.setPath(tg.pathTo(reach, x, z))`, cursor `tg.setCursor(x, z)`, enemy zones `tg.setOverlay(\'threat\', tg.threatOf(enemies))`; keys through `tg.gridDirFromScreen(dx, dy)`, mouse through `tg.pickTile(px, py)`; Q / E `tg.rotate`, wheel `tg.zoomBy`.'],
    ['Your move and attack', '`tg.walk(id, path, {onDone})` (write the tile in onDone); `tg.attack(att, def, {onImpact, onDone})` with your damage code in onImpact, then `tg.hurt(def, att)` / `tg.defeat(def)`; AI and autoplay wait for onDone.'],
    ['Your fixed step and draw', '`tg.update(dtMs)` every step (0 while frozen); `tg.render()` then your HUD on `tg.overlayContext()` with `tg.anchorOf(id)`.']
  ],
  gotchas: [
    'Units walk backwards -> a custom model needs its own `facingOffset` (`setModel` / `registerLook`); never rotate per scene.',
    'Feet float on terraces -> never move the actor objects yourself; use `walk` / `setTile`.',
    'Arrow keys go the wrong way after a camera turn -> map keys with `gridDirFromScreen`.',
    'Nothing moves in `?t=&freeze=1` -> `update` runs in the fixed step, not in requestAnimationFrame.',
    'HP drops before the swing lands -> damage only inside `onImpact`.'
  ],
  checks: [
    'Selecting a unit shows blue reach that stops at cliffs higher than its jump and at water, a red strike fringe, and a gold path arrow that climbs the terraces; hovering an enemy shows its striped threat zone.',
    'Q / E turn the camera 90 degrees (eased) and arrows still move the cursor the way the screen shows; the wheel zooms.',
    'Every walking unit faces its step and every attacker its target (`state()` facesMove / facesTarget true), feet stay on the tile tops (`feetOk`), autoplay ends the same way as before.'
  ],
  selfcheck: [
    'Trace one move (select -> reachOf -> walk -> onDone) and one attack (attack -> onImpact -> your damage -> hurt / defeat -> onDone -> next).',
    'A step from height 1 to 3 costs terrain 1 + 2 x {{climbCost}}; with jump {{jump}} a 3-level climb is impossible.'
  ],
  starter: {
    name: 'Terrace Skirmish',
    modules: 'with `<script src>` tags right above the ADDONS SLOT `<script>` (or pasted unchanged into it); `three.min.js` stays next to `index.html`',
    register: 'push it onto `GAME.addons` in the ADDONS SLOT `<script>` of `index.html` (it runs before `GAME.boot()`, so addons see the first turn and every `?t=` frame) (hooks: `onHit(ev, game)`, `onMove(ev, game)`, `update(game, {dt, frozen})`, `draw(ctx, game)` (2D overlay effects layer), `drawUI(ctx, game)` (top UI layer), `scene3d(THREE, scene, game)`, `onKey(e, down, game)`, `onTurnStart(turn, side, game)`, `onPhase(phase, game)`, `onEnd(result, game)`). Unit positions: use the live `GAME.anchorOf(id)` and `GAME.unitRects()` (2D overlay px, they follow walks, hops and lunges)',
    hit: '`onHit(ev, game)` runs on the impact frame, right after the hit site `applyHit` changed HP (attacks, counters; addons call `GAME.hit(attackerId, targetId, amount, kind)`): `ev = {attacker, target, amount (HP really lost or gained), kind: \'attack\' | \'counter\' | \'heal\', crit, killed, hpBefore, hpAfter, max, anchor}`. Feedback helpers: `GAME.hitStop(ms)`, `GAME.shake(px, ms)`, `GAME.flash(color, ms)`',
    draw: '`draw(ctx, game)`: the 2D overlay context in logical 960x540 px (already scaled to the device pixels), drawn over the 3D view after the HP bars and built-in numbers, before the HUD',
    rects: '`GAME.uiRects()` (HUD panels, buttons, menu, forecast, banner; logical px) and `GAME.unitRects()` (each living unit\'s box with its `id`)',
    field: 'the whole overlay `{x: 0, y: 0, w: 960, h: 540}`',
    anchor: '`GAME.anchorOf(id)` -> `{x, top, w, h, left, footY, cy, dead}` where the 3D model is drawn now, projected to overlay px (`top` includes the HP bar); it answers for fallen units; units are `GAME.units` (alive while `hp > 0`)',
    clock: '`update(game, {dt, frozen})` runs every 60 Hz step; `dt` is ms (16.67, 0 while frozen by hit-stop). `GAME.hitStop(ms)` freezes the world',
    reset: '`onTurnStart(turn, side)` with `turn === 1 && side === \'a\'` (new game and restart)',
    builtins: { numbers: 'set `GAME.builtinNumbers = false` in the ADDONS SLOT (the starter\'s own damage numbers)' },
    keep: '`?auto=1`, `?t=<ms>&freeze=1` (with `&script=`), `window.__state()` and `window.__advance`, keys Q / E (camera), + / - (zoom), T, F, R, P, mouse and touch, and `three.min.js` beside `index.html`',
    traceFrom: 'the hit site `applyHit` (an autoplay attack and its counter)',
    autoCheck: '`?auto=1` still reaches VICTORY on turn 7 with the same HP results'
  },
  offers: {
    'hit-site': 'The module never applies damage: attack with `tg.attack(..., {onImpact})` and change HP in your own code inside onImpact.',
    'anchor': '`tg.anchorOf(id)` -> `{x, top, w, h, left, footY, cy, dead}` in overlay px where the 3D model is drawn now.',
    'ui-rects': 'The module draws no 2D UI; your HUD on the overlay is the only UI.',
    'freeze': '`tg.update(0)` freezes every animation, projectile and the camera.',
    'battle-start': 'Your map or battle start is where you call `clearActors()` and `addActor` again.'
  }
};
