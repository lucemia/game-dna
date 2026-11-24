// Basket hint for B-06 pseudo3d-flight (module v1.0): how to wire the module into an UNKNOWN top-down game, by role.
export default {
  stage: 'systems',
  does: 'A flight mode for a top-down game: a take-off key turns the walking map into a perspective, scanline-scaled ground with a horizon sky band (zoom, turn and tilt over the transition). The player flies a mount (turn with a slight horizon tilt, speed up, slow down) past billboards scaled by distance, with the mount\'s shadow and a mini-map, and lands only where the game says the ground is flat; the landing eases back to the exact walking view. The module draws the whole map view while busy.',
  params: {
    speed: 'create `params.speed`', turn: 'create `params.turn`', bank: 'create `params.bank`', height: 'create `params.height`',
    horizon: 'create `params.horizon`', transition: 'create `params.transition`', fog: 'create `params.fog`', sky: 'create `params.sky`',
    mount: 'create `params.mount`', minimap: 'create `params.minimap`', res: 'IGNORE'
  },
  steps: [
    ['After your map and tile art exist, before the first frame',
      '`fl = GameDNA_Flight.create({cols, rows, tile, view, tileAt, tileImage, canLand, topdown, wrap, outsideTile, billboards, markers, onLand, params: {speed: {{speed}}, turn: {{turn}}, bank: {{bank}}, height: {{height}}, horizon: {{horizon}}, transition: {{transition}}, fog: {{fog}}, sky: \'{{sky}}\', mount: \'{{mount}}\', minimap: \'{{minimap}}\'}})`. `view` = the map rectangle in the canvas (below a HUD band). `tileAt(tx, ty)` = your tile id; `tileImage(id, tx, ty)` = the tile canvas your map draws. `canLand(tx, ty)` = in the map, walkable, flat, nobody and nothing on it. `topdown()` = your walking camera `{x, y}` (world px at the view\'s top-left). `wrap: true` only for a wrapping world; otherwise `wrap: false, outsideTile: <border tile id>`. `billboards` = `{x, y, kind}` per tree / rock / house tile (`tree pine rock town tower mountain`). `onLand: L => {...}` puts the hero\'s centre at `L.x, L.y` and recomputes your camera exactly as walking does.'],
    ['Your fixed 60 Hz step', '`fl.update()` every step; while `fl.busy()`, return early from the walking-map update only (no walking, enemy touches, interactions, click-to-walk); dialogs, battles and scene changes stay as they were.'],
    ['Your walking input (a key the game does not use yet, e.g. F)', 'On the walking map with no dialog: `fl.takeOff({x: heroCentreX, y: heroCentreY, facing: \'up\'|\'down\'|\'left\'|\'right\'})`; add the key to your hint line or HUD.'],
    ['Your keydown / keyup handlers', 'First in keydown: `if (fl.key(e.code, true)) { e.preventDefault(); return; }`; keyup: `fl.key(e.code, false)`. True only while flying, so walking keys and shortcuts are untouched. A game that polls its own key sets releases them at take-off.'],
    ['Your map draw pass', '`if (!fl.draw(ctx)) <your map drawing>`; HUD on top. Restart / new game: `fl.reset()`.'],
    ['Your autopilot (if any)', 'Unchanged: it never presses the take-off key, so `?auto=1` ends exactly as before.']
  ],
  gotchas: [
    'The landing ends with a jump to another spot -> `onLand` moved the hero but not the camera; recompute the camera there, the module reads `topdown()` during the landing.',
    'Take-off starts somewhere else than the walking view -> `topdown()` or `view` is wrong (camera in world px at the view\'s top-left; view below the HUD band).',
    'The mount lands in water or on a tree -> `canLand` returned true for it; only flat walkable free tiles.',
    'The take-off key also cancels a menu or opens something -> it was already bound; pick a free key.',
    'Enemies catch the hero while flying, or the autopilot changed its ending -> the walking update still runs while `busy()`; return early.',
    'The flight ground looks like flat colour blocks -> pass `tileImage` with your real tile canvases.'
  ],
  checks: [
    'Take-off on grass: in {{transition}} ms the map rotates, zooms and tilts to a horizon with sky; the mount flies with its shadow; trees and houses stand as billboards.',
    'Turning banks the mount and tilts the horizon slightly; up/down change speed; the mini-map shows mount and goal.',
    'Landing over water or trees is refused ("NO LANDING"); over grass it ends exactly on the walking view with the hero on that tile.',
    '`?auto=1` ends the same as before; no console errors.'
  ],
  selfcheck: [
    'Every `fl.` call sits in the steps above and `fl` exists before the first frame.',
    'Trace a flight: take-off -> `busy()` -> walking update skipped -> land over grass -> `onLand` moves hero and camera -> walking resumes.',
    'Trace `?auto=1`: the take-off key is never pressed; with `busy()` false the walking update runs as before.'
  ],
  // Starter basket (FORMAT v1.2): the documented extension points of starter/index.html (see starter/README.md).
  starter: {
    name: 'Windrider Post',
    modules: 'with its own `<script src>` (or pasted unchanged into its own `<script>`) in the ADDONS slot (the empty `<script>` block marked ADDONS SLOT, before the boot script)',
    register: 'push it onto `GAME.addons` in the ADDONS slot, before boot (hooks: `onHit(ev, game)`, `update(game, {dt, frozen})`, `draw(ctx, layer, game)` with layer `\'world\'` (after the map or flight view, inside the shake) or `\'ui\'` (after the HUD), `onKey(e, down, game)`, `onPhase(phase, game)`, `onStart(game)`, `onDeliver(town, game)`)',
    hit: '`onHit(ev, game)` runs right after the hit site `applyHit` (also `GAME.hit(target, amount, kind, source)`) changed the mount\'s stamina: a storm wisp strike (`kind: \'damage\'`, 2) or a feather / rest (`kind: \'heal\'`). `ev = {source, target (\'mount\' or \'hero\'), amount (>= 0, after clamping), kind, killed, hpBefore, hpAfter, max, anchor}`. The kinds are already `damage` / `heal`. Feedback helpers: `GAME.hitStop(ms)`, `GAME.shake(px, ms)`, `GAME.flash(color, ms)`',
    draw: '`draw(ctx, \'world\', game)`: native 256x224 context inside the shake, after the walking map or the flight view and the built-in numbers, before the HUD',
    rects: '`GAME.uiRects()` (HUD, the flight mini-map / prompt / speed gauge or the walking prompt, the banner, plus addon rects from `GAME.setUIRect(name, rect)`; native px)',
    field: 'the whole screen `{x: 0, y: 0, w: 256, h: 224}`',
    anchor: '`GAME.anchorOf(id)` -> `{x, top, w, h, footY}` in screen px: `\'mount\'` is the mount sprite as drawn this frame (`\'hero\'` too while flying), also `\'wisp-N\'` and `\'town-N\'` while in the air',
    clock: '`update(game, {dt, frozen})` runs every 60 Hz step, also during hit-stop; `dt` is in **ms** (16.67, or 0 while frozen), so pass it straight to an ms-based update. `GAME.hitStop(ms)` freezes the world',
    reset: '`onStart(game)` (a new game or restart, before the first delivery)',
    builtins: { numbers: '`GAME.builtinNumbers = false` (in the same ADDONS slot)' },
    keep: '`?auto=1`, `?t=<ms>&freeze=1`, keys X (take off), Z (land), P (autoplay), R (restart), the touch pad',
    traceFrom: '`applyHit` (an autoplay wisp strike while flying)',
    autoCheck: '`?auto=1` still delivers all three letters (ALL LETTERS DELIVERED)'
  },
  offers: {
    'hit-site': 'The flight module applies no damage; the game\'s own hazards (touches, collisions) stay the hit sites. While flying, the hero is drawn as the mount: use `fl.anchor()` for it.',
    'anchor': 'While `fl.busy()`: `fl.anchor()` -> `{x, top, w, h, footY}` (canvas px) is the mount; `fl.project(wx, wy, wz)` places anything else in the flight view.',
    'ui-rects': 'The flight UI rects are `fl.getUIRects()` (mini-map, prompt, gauge) from the last `draw`.',
    'freeze': 'During a freeze, skip `fl.update()`; keep calling `fl.draw(ctx)`.',
    'battle-start': 'A new game or restart calls `fl.reset()`.'
  }
};
