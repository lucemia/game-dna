// Basket hint for K-01 camera-director: how to wire the module into an UNKNOWN game, by role.
export default {
  stage: 'effects',
  does: 'Replaces the hard-follow camera with a directed one: a critically damped spring with a dead zone, eased look-ahead, vertical re-framing only on landing (side view), the hero and a boss kept in frame together (zoom out, or a lean when the game cannot zoom), zoom punches and trauma shake on big hits, clean level and room edges, and cuts on teleports. Sub-pixel on HD games, whole pixels on pixel games. View only: the game keeps its own camera for gameplay, so rules and autoplay endings never change.',
  params: {
    view: 'IGNORE', follow: 'create `params.follow`', followY: 'create `params.followY`',
    deadW: 'create `params.deadW`', deadH: 'create `params.deadH`', look: 'create `params.look`', lookHz: 'create `params.lookHz`',
    idleLook: 'create `params.idleLook`', platform: 'create `params.platform`', farY: 'create `params.farY`', biasY: 'create `params.biasY`',
    safe: 'create `params.safe`', frame: 'create `params.frame`', minZoom: 'create `params.minZoom`', minSize: 'create `params.minSize`', blend: 'create `params.blend`', pad: 'create `params.pad`',
    punch: 'create `params.punch`', shake: 'create `params.shake`', roll: 'create `params.roll`', decay: 'create `params.decay`',
    freq: 'create `params.freq`', snap: 'create `params.snap`', reduced: 'create `params.reduced`', mode: 'create `params.mode` (`off` = the game\'s own camera, for comparisons)'
  },
  steps: [
    ['Before you change anything: every reader of the game\'s current camera variable (search its name)',
      'List each one as DRAW (tile and sprite positions, draw culling, parallax, screen effects at world points, pointer -> world) or GAMEPLAY (spawn or wake "on screen", despawn, AI visibility, autoplay, test hooks, saves). Only DRAW readers change. The game keeps computing its own camera exactly as before; never assign the director\'s values to it.'],
    ['Once, when the level size is known',
      '`cam = GameDNA_Camera.create({view: {x: 0, y: 0, w: <world view width>, h: <height>}, bounds: {x: 0, y: 0, w: <level width>, h: <level height>}, seed: 1, uiRects: () => [<HUD panels and labels, screen px>], params: {view: <\'side\' for a side-view game (platformer, run and gun, gravity, jumping) or \'top\' for a top-down game (moves in 4 or 8 directions, no gravity): decide from the game, not from this text>, follow: {{follow}}, followY: {{followY}}, deadW: {{deadW}}, deadH: {{deadH}}, look: {{look}}, lookHz: {{lookHz}}, idleLook: {{idleLook}}, platform: \'{{platform}}\', farY: {{farY}}, biasY: {{biasY}}, safe: {{safe}}, frame: \'{{frame}}\', minZoom: {{minZoom}}, minSize: {{minSize}}, blend: {{blend}}, pad: {{pad}}, punch: {{punch}}, shake: {{shake}}, roll: {{roll}}, decay: {{decay}}, freq: {{freq}}, snap: \'{{snap}}\', reduced: \'{{reduced}}\', mode: \'{{mode}}\'}})`. `view` is the screen rect the world is drawn into (logical px; below a HUD strip if the game has one). Add `zoom: false` if the world is drawn by subtracting the camera from each position and you will not wrap it. A level of another size: `cam.setBounds(...)`. Redrawing several times per step (pause screens, menus, high refresh rates) is fine: `apply` gives the same transform until the next `update`.'],
    ['Your fixed update step (the one `?t=` fast-forward and `?auto=1` also run), after movement and after the game\'s own camera update, on every scene that shows the world',
      '`cam.update(<step ms>, {target: {x, y, w, h, vx, vy, onGround, facing}, extra: <living boss (even off screen: it fades in by distance) or second player ? [{x, y, w, h}] : []>, legacy: {x: <old camera x>, y: <old camera y>}, room: <arena rect while it is shut, else null>})`: target = the hero\'s sprite centre and drawn size in WORLD px; `onGround` only for side-view games; `facing` 1 | -1.'],
    ['The world draw (DRAW readers)',
      'Translate-style: replace the camera translate with `cam.apply(ctx)` and its restore with `cam.restore(ctx)`; draw in world coordinates. Subtract-style: read `cam.x` / `cam.y` where the old variable was read (optionally inside `cam.applyScreen(ctx)` ... `cam.restore(ctx)` for zoom and roll). Cull drawing with `cam.visible(<one tile>)`; parallax reads `cam.cx` / `cam.cy`; pointer -> world uses `cam.toWorld(sx, sy)`. HUD after `restore`.'],
    ['Big impacts', 'Hits that matter: `cam.hit({strength: <\'finisher\' for killing blows, \'heavy\' for strong hits and the player being hurt, \'light\' for chip hits>, at: {x, y} <world px>})` once per accepted hit; slams and explosions: `cam.trauma(0.3-0.6)`.'],
    ['Teleports, respawns, doors, level starts, title -> play, restart', '`cam.cut(<target x>, <target y>)` (after a new run: `cam.clear()` first).']
  ],
  gotchas: [
    'Enemies wake or spawn at other times, autoplay ends differently -> the director was written into the game\'s camera or a gameplay reader was switched; switch only drawing.',
    'Tiles pop in at the edges when the view leads or zooms out -> drawing is still culled with the old camera or the view size; use `cam.visible(pad)`.',
    'The view drifts away from the hero -> `target` is in screen px; pass world px.',
    'The view slides across the level after a respawn or a door -> no `cut` there.',
    '`?t=` frames differ between runs, the view moves faster at high refresh rates -> `update` is in render or uses wall-clock time; call it once per fixed step.',
    'The backdrop slides against the world -> parallax still reads the old camera.',
    'Double, jerky shake -> the game\'s own shake still runs; route it to `cam.shake(px, ms)` or set one of the two to 0.',
    'Numbers, sparks or windows placed at a unit drift away from it -> another element was given screen positions from the old camera; use `cam.toScreen(x, y)`.',
    'The camera bobs on every jump -> `onGround` is not passed (platform snapping off).',
    'The hero walks to the screen edge after an arena opens -> the room is still passed; pass `room: null` once the exit opens.',
    'The hero is framed under a HUD panel -> `uiRects` not given; return the HUD and label rects in screen px.'
  ],
  checks: [
    'Running: more room ahead of the hero; turning round eases the view across instead of snapping.',
    'Jumping: no vertical bob; the view rises only after landing higher, and follows a long fall.',
    'A boss: hero and boss both in view; a finishing blow punches in toward the hit and shakes with a slight roll, settled within half a second; the HUD never moves.',
    'Level edges: the view stops cleanly with no jitter; `?auto=1` reaches the same ending at the same time as without the element.'
  ],
  selfcheck: [
    'Every reader of the old camera is listed as DRAW (switched) or GAMEPLAY (unchanged); nothing assigns `cam` values into game state.',
    '`cam.update` runs once per fixed step with a WORLD-px target and `legacy`; `cut` runs at every teleport, respawn and level start.',
    'Walk one landing with the defaults: airborne, `cam.cy` holds; after landing 110 px higher it reaches 95 % in ~33 frames, with no overshoot.'
  ],
  offers: {
    'anchor': 'Screen position of a world point for every other element (numbers, sparks, windows, lights): `cam.toScreen(x, y)` (zoom, roll and shake included), not world minus the old camera. Inside `cam.apply` you can draw at world coordinates directly.',
    'hit-site': 'Every accepted hit also calls `cam.hit({strength, at})` on the same step.'
  },
  wants: {
    'hit-site': { title: 'hit sites', text: 'Call `cam.hit({strength: <light | heavy | finisher>, at: {x, y}})` there too, once per accepted hit.', check: 'Heavy and finishing blows punch the view in and shake it; light hits only tremble.' },
    'freeze': { title: 'hit-stop', text: 'With this camera in the game, the camera owns the shake: give the hit-stop element `shake: 0` (its freeze and flashes stay) and route `onShake` callbacks to `cam.shake(px, ms)` instead of the hit-stop element. Call `cam.update` on every step, frozen or not (it is view only).', check: 'One shake only: during a hit-stop the frozen frame trembles through the camera, and the HUD stays still.' },
    'battle-start': { title: 'reset', text: 'Call `cam.clear()` and then `cam.cut(<hero x>, <hero y>)` there.' }
  }
};
