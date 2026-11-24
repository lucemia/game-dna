// Basket hint for E-10 squash-stretch: how to wire the module into an UNKNOWN game, by role.
export default {
  stage: 'effects',
  does: 'Every sprite the game already draws bends about its feet, with no new frames: a crouch before jumps, swings and spells, a stretch while rising and falling fast, a squash on landing and on taking a hit, a springy overshoot back, a lean into movement and a slow breath at rest. Area is kept (sx*sy = 1). It is a canvas transform around the sprite draw only: positions, hit boxes, timing and rules never change, so autoplay ends exactly as before. Whole pixels on pixel games, smooth on HD.',
  params: {
    amount: 'create `params.amount`', squash: 'create `params.squash`', stretch: 'create `params.stretch`', spring: 'create `params.spring`',
    wobble: 'create `params.wobble`', lean: 'create `params.lean`', breathe: 'create `params.breathe`', walk: 'create `params.walk`',
    anticipation: 'create `params.anticipation`', snap: 'create `params.snap`', reduced: 'create `params.reduced`',
    view: 'create `params.view` (`top` for top-down games: no air stretch, no auto landing)'
  },
  steps: [
    ['Once, before the first reset of your actors',
      '`ss = GameDNA_SquashStretch.create({params: {amount: {{amount}}, squash: {{squash}}, stretch: {{stretch}}, spring: {{spring}}, wobble: {{wobble}}, lean: {{lean}}, breathe: {{breathe}}, walk: {{walk}}, anticipation: {{anticipation}}, snap: \'{{snap}}\', reduced: \'{{reduced}}\', view: \'{{view}}\'}})`; then for each actor kind `ss.attach(id, {w, h, maxSpeed, maxFall})`: drawn sprite size, and the run speed and fall speed that mean "full", in the SAME units as the velocities you pass (px per step or px per second); rigid actors (armour, robots, stone) add `stiffness: 0.5` so they squash less than soft ones (slimes stay 0). Actors without an id: give each a stable id string where they are created.'],
    ['Your fixed update step (the one `?t=` fast-forward and `?auto=1` also run), after movement and collisions',
      '`ss.motion(id, vx, vy, onGround)` for every moving actor (+vy = down; `onGround` null for flyers; no velocity variable: pass the position change since the last step), then `ss.update(<step ms>)` once, as the last line of the step, on every scene.'],
    ['Where an attack or spell STARTS (the game\'s own wind-up keeps its timing)', '`ss.event(id, \'attack\', 1, <facing 1 | -1>)`; a long telegraphed wind-up: `ss.event(id, \'charge\', 1, <toward target>)` at its start and `ss.event(id, \'release\')` when it fires.'],
    ['Every place damage is ACCEPTED (after invulnerability checks), player and enemies', '`ss.event(targetId, \'hit\', <killing blow ? 1.4 : 1>, <blow direction 1 | -1>)` once.'],
    ['Each actor\'s sprite draw (only the sprite: not its shadow, HP bar, name or the HUD)',
      '`ss.wrap(ctx, id, footX, footY, () => <existing sprite draw>)`, feet = bottom centre of the drawn sprite in the coordinates it is drawn with (camera applied). If the draw function also draws a bar or label, use `ss.apply(ctx, id, footX, footY)` before the body and `ss.restore(ctx)` before the bar, on every path. A shadow may widen by `ss.transform(id, ctx).sx`.'],
    ['Level, life, respawn and restart', '`ss.clear()` (or `ss.clear(id)` for one respawned actor); removed actors: `ss.detach(id)`.']
  ],
  gotchas: [
    'Sprites sink into the floor or float when squashed -> the foot point is the sprite\'s top-left or centre; pass the bottom centre in draw coordinates.',
    'The HUD or the whole field shifts or scales for a moment -> an `apply` has no `restore` on some path; use `wrap`.',
    'Autoplay ends differently -> game logic reads `transform()` or a size was changed; the module must only touch drawing.',
    'Poses jump or stutter, `?t=` frames differ between runs -> `update` sits in the render loop or uses wall-clock time; call it once per fixed step.',
    'No landing squash -> `onGround` is not passed (or always true); pass the real flag after collisions.',
    'Squash never springs back -> `update` is never called (the module then advances per draw, after 40 draws).',
    'HP bars wobble with the sprite -> the bar is inside the wrapped draw; restore before it.',
    'Pixel sprites shimmer with half-pixels -> `snap` is `smooth` on a pixel game; leave `auto` (it reads `imageSmoothingEnabled === false`) or set `pixel`.',
    'An HD game\'s poses step in whole pixels -> the integration switched `imageSmoothingEnabled` off; keep the game\'s own smoothing setting.',
    'An armoured knight flattens as much as a slime -> pass `stiffness` 0.4-0.6 in its `attach`.'
  ],
  checks: [
    'A jump: crouch on take-off, tall and thin while rising, squat and wide on landing, springing back past normal; the feet stay on the ground line.',
    'An attack: a crouch leaning back, then a lunge toward the target; the struck actor squashes and tilts away from the blow.',
    'Running leans into the direction; standing still breathes; hit boxes and the HUD never move with the sprite.',
    '`?auto=1` reaches the same ending at the same time as without the element.'
  ],
  selfcheck: [
    '`ss.update` runs once per fixed step, inside the step; `ss.motion` runs after each actor moves; nothing in game logic reads the module.',
    'Every sprite draw is wrapped (or `apply`/`restore` paired on every path); bars, labels and the HUD are outside.',
    'Walk one landing with the defaults: `sy` 0.72 held ~3 frames, back over 1.0 to ~1.04, settled by ~16 frames; the collision box is identical on each frame.'
  ],
  offers: {
    'hit-site': 'Every accepted hit also calls `ss.event(targetId, \'hit\', strength, blowDir)` on the same step.',
    'anchor': 'A sprite\'s deformed box: `ss.transform(id, ctx)` gives `sx`, `sy`, `k` about the feet; effects that sit on a sprite\'s head (numbers, icons) may lift by `h * (sy - 1)`, or ignore it (the module never moves the feet).'
  },
  wants: {
    'hit-site': { title: 'hit sites', text: 'Call `ss.event(targetId, \'hit\', <killing blow ? 1.4 : 1>, <blow direction>)` there too, once per accepted hit.', check: 'Every landed hit squashes its target and tilts it away from the blow.' },
    'freeze': { title: 'hit-stop', text: 'Call `ss.update(...)` only on steps the world runs (inside the gate), so the squash holds during a hit-stop and springs back after it.', check: 'During a hit-stop the struck sprite stays squashed; it springs back when the world resumes.' },
    'battle-start': { title: 'reset', text: 'Call `ss.clear()` there.' }
  }
};
