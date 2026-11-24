// Basket hint for B-08 platformer-feel (module v1.0): how to wire the module into an UNKNOWN side-view game, by role.
export default {
  stage: 'systems',
  does: 'Replaces the hero\'s movement and tile collision in a side-view game: separate ground and air acceleration, variable jump height (release to cut), coyote time, jump buffering, apex hang, a heavier fall with a terminal speed, an 8- or 4-way dash that refills on landing, wall slide and wall jump, one-way platforms, ceiling-corner and ledge-lip correction, and sub-pixel positions that always rest on whole pixels (no tunnelling at any speed). Presets: tight, floaty, heavy, raw. The game keeps its sprites, enemies, hazards, camera and rules; it feeds input each step and reads position, velocity, onGround, facing and pose back.',
  params: {
    preset: 'create `preset`', runSpeed: 'create `params.runSpeed` (px/s; old px per frame x 60)', groundAccel: 'create `params.groundAccel`', groundDecel: 'create `params.groundDecel`',
    turnAccel: 'create `params.turnAccel`', airAccel: 'create `params.airAccel`', airDecel: 'create `params.airDecel`', jumpHeight: 'create `params.jumpHeight` (never lower than the game\'s old jump)',
    jumpApexMs: 'create `params.jumpApexMs`', jumpCut: 'create `params.jumpCut`', minJumpMs: 'create `params.minJumpMs`', apexBand: 'create `params.apexBand`', apexGravity: 'create `params.apexGravity`',
    fallMult: 'create `params.fallMult`', maxFall: 'create `params.maxFall`', coyoteMs: 'create `params.coyoteMs`', bufferMs: 'create `params.bufferMs`', dash: 'create `params.dash`',
    dashSpeed: 'create `params.dashSpeed`', dashMs: 'create `params.dashMs`', dashCooldownMs: 'create `params.dashCooldownMs`', dashCount: 'create `params.dashCount`', wall: 'create `params.wall`',
    wallSlide: 'create `params.wallSlide`', wallJumpX: 'create `params.wallJumpX`', wallJumpLockMs: 'create `params.wallJumpLockMs`', corner: 'create `params.corner`', ledge: 'create `params.ledge`', drop: 'create `params.drop`'
  },
  steps: [
    ['Once, after the level and the hero exist',
      '`pf = GameDNA_Platformer.create({tile, body: {w, h} (the hero\'s hitbox), x, y (its top-left, world px), preset: \'{{preset}}\', tileAt, params: {dash: \'{{dash}}\', wall: \'{{wall}}\', coyoteMs: {{coyoteMs}}, bufferMs: {{bufferMs}}, corner: {{corner}}, ledge: {{ledge}}, runSpeed, jumpHeight, jumpApexMs, maxFall}})`. `tileAt(tx, ty)` = `\'solid\'` for wall/ground tiles, `\'oneway\'` for stand-on-top platforms, else `null`; outside the map answer as the old collision test did (side walls solid, below the map empty). Convert the game\'s old numbers so every level stays beatable: px per frame x 60 = px/s; old jump height = v² / (2g) in per-frame units; keep `jumpHeight` at least that.'],
    ['The fixed 60 Hz step, where the hero used to move (the step `?t=` fast-forward and autoplay run)',
      '`pf.setInput({left, right, up, down, jump: <jump held>, jumpPressed: <jump pressed since the last step>, dash, dashPressed})` from the game\'s own input object (so autoplay and touch drive it), then `pf.update()`, then copy back `hero.x = pf.x; hero.y = pf.y; hero.onGround = pf.onGround` and velocities in the game\'s units (`pf.vx / 60`). Keep the rest of the hero update (attacks, timers, invulnerability, falling-out checks).'],
    ['Every place that moves the hero directly', 'Knockback -> `pf.knock(vx, vy, ms)` (px/s); respawn, checkpoint, level start, restart -> `pf.reset(x, y)`; a bounce off an enemy -> `pf.bounce()`.'],
    ['The key bindings', 'A dash key the game does not use yet (C or Shift); add it to the help text.'],
    ['The draw pass', 'The hero sprite at `pf.x, pf.y` (whole px), frame from `pf.pose`; optionally `pf.drawFx(ctx, camX, camY)` after the sprites (dust, dash after-images).']
  ],
  gotchas: [
    'The hero sinks into the floor or jitters -> something else still writes `hero.x/y` or applies gravity after `pf.update()`; remove the old movement only, and route respawn / knockback through `reset` / `knock`.',
    'Autoplay falls into a pit it used to clear -> `jumpHeight` or `runSpeed` is lower than the old numbers, or the autoplay\'s held jump never reaches `jump` (only `jumpPressed`): pass both.',
    'Quick taps do nothing -> the game passes only "held" state; pass its latched press as `jumpPressed` (or use `pf.key`).',
    'The hero walks through a wall at the map edge -> `tileAt` returns empty outside the map; return `\'solid\'` there as the old test did.',
    'Enemies or the camera lag a frame or read NaN -> they read hero fields that are no longer updated; copy every field they use back from the module each step.'
  ],
  checks: [
    'Hold jump: a high arc; a tap: a short hop; run off a ledge and jump a few frames late: still a jump; press jump just before landing: it jumps on touch-down.',
    'Dash in 8 directions once per landing; push into a wall while falling: a slow slide; jump there: a kick away; a jump into a ceiling corner slides around it.',
    '`?auto=1` reaches the same ending as before; no console errors.'
  ],
  selfcheck: [
    'Nothing writes the hero position after `pf.update()` except `pf.reset` / `teleport`; every reader of the hero fields gets them from the module each step.',
    'Trace the autoplay\'s gap jump with the new numbers: airtime x run speed > the widest gap; jump height > the highest step.',
    'Worked example: jumpHeight 44, jumpApexMs 330 -> gravity 808 px/s², take-off 267 px/s.'
  ],
  // Starter basket (FORMAT v1.2): the documented extension points of starter/index.html (see starter/README.md).
  starter: {
    name: 'Lantern Ascent',
    modules: 'with its own `<script src>` (or pasted unchanged into its own `<script>`) in the ADDONS slot (the empty `<script>` block marked ADDONS SLOT, before the boot script)',
    register: 'push it onto `GAME.addons` in the ADDONS slot, before boot. Hooks: `gate(game)` (called FIRST in every 60 Hz step, before input, autoplay and the world; return `false` to hold the whole world for this step: a hit-stop; latched input waits), `update(game, {dt, frozen})`, `onHit(ev, game)`, `onMove(name, info, game)` (the module\'s movement events), `drawBegin(ctx, game)` / `drawEnd(ctx, game)` (wrap the play field: backdrop, tiles, sprites, effects; the HUD comes after), `draw(ctx, layer, game)` with layer `\'world\'` (inside the field, after sprites and dust), `\'post\'` (after `drawEnd`, before the HUD) or `\'ui\'` (last), `sprite(ctx, id, rect, next, game)` (wraps each sprite draw: call `next()` to draw it), `onKey(e, down, game)`, `onPhase(phase, game)`, `onStart(game)`, `onRoom(index, game)`, `onPickup(kind, game)`',
    hit: '`onHit(ev, game)` runs right after the hit site `applyHit` (also `GAME.hit(target, amount, kind, source)`): a thorn, pit or beetle hurting the hero (`target: \'hero\'`, `kind: \'damage\'`), a stomp defeating a beetle (`target: \'beetle-N\'`, `cause: \'stomp\'`, `killed: true`) or a heart pickup (`kind: \'heal\'`). `ev = {source, target, amount, kind, cause, dir, killed, hpBefore, hpAfter, max, anchor, frame}`. Feedback helpers: `GAME.hitStop(ms)`, `GAME.shake(px, ms)`, `GAME.flash(color, ms)`',
    draw: '`draw(ctx, \'world\', game)`: native 256x224 context inside the play field (after `drawBegin`, inside the built-in shake), after the sprites and the module\'s dust; `drawBegin` / `drawEnd` wrap the whole field; the HUD (top 16 px band) is drawn after `drawEnd`',
    rects: '`GAME.uiRects()` (the HUD band 0,0,256,16, the room banner, the end window, the feel overlay panels while shown, plus addon rects from `GAME.setUIRect(name, rect)`; native px)',
    field: '`GAME.field` = `{x: 0, y: 16, w: 256, h: 208}` (below the HUD band)',
    anchor: '`GAME.anchorOf(id)` -> `{x (centre), top, w, h, footY}` in screen px for `\'hero\'` (the drawn 16x22 sprite) and `\'beetle-N\'`; world -> screen = `(x - GAME.cam.x, y - GAME.cam.y)`',
    clock: '`update(game, {dt, frozen})` runs every 60 Hz step, also on held steps; `dt` is in **ms** (16.67, or 0 while frozen); `gate(game)` returning false holds the step (the hero, beetles, autoplay and timers all wait). `GAME.hitStop(ms)` is the built-in freeze',
    reset: '`onStart(game)` (a new game or restart) and `onRoom(index, game)` (each room entry)',
    builtins: { numbers: '`GAME.builtinNumbers = false` (in the same ADDONS slot)', shake: '`GAME.builtinShake = false` (the built-in hit-stop, shake and red flash)' },
    keep: '`?auto=1`, `?t=<ms>&freeze=1`, `?preset=`, `?overlay=1`, keys Z (jump), X (dash), V (feel overlay), P (autoplay), R (restart), the touch pad',
    traceFrom: '`applyHit` (an autoplay stomp on the beetle in Mossy Gate)',
    autoCheck: '`?auto=1` still lights the beacon (THE BEACON IS LIT) with every preset'
  },
  offers: {
    'hit-site': 'The module applies no damage; the game\'s own hazards and enemy touches stay the hit sites. Knockback after a hit goes through `pf.knock(vx, vy, ms)`.',
    'anchor': '`pf.anchor(camX, camY)` -> `{x, top, w, h, footY}` of the hitbox in screen px; use the game\'s sprite box if it is larger.',
    'freeze': 'During a hit-stop skip `pf.update()` (or call `pf.update(0)`): latched presses wait for the next real step.',
    'battle-start': 'Respawn, level start and restart call `pf.reset(x, y)`.'
  }
};
