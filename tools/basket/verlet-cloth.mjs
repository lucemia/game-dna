// Basket hint for E-12 verlet-cloth: how to wire the module into an UNKNOWN game, by role.
export default {
  stage: 'effects',
  does: 'Capes, scarves, ribbons, hair tufts, banners, hanging ropes and chains that swing with movement and wind: a small Verlet solver pinned to an anchor on an actor or a post, with gravity, damping, gusts from game time and a ground line, drawn smooth and shaded on HD games and in whole pixels with a 1 px outline on pixel games. It only reads anchors and only draws: positions, hit boxes and rules never change, so autoplay ends exactly as before. A teleporting anchor (respawn, restart) re-poses its cloth hanging at rest instead of stretching it across the screen.',
  params: {
    wind: 'create `params.wind` (+ blows right)', gust: 'create `params.gust`', stiffness: 'create `params.stiffness`', segments: 'create `params.segments`',
    damping: 'create `params.damping`', gravity: 'create `params.gravity`', drape: 'create `params.drape`', shade: 'create `params.shade`',
    outline: 'create `params.outline`', snap: 'create `params.snap`', reduced: 'create `params.reduced`',
    view: 'create `params.view`: keep `auto` (top-down physics for anchors that return `fx, fy`, side view for anchors that return only `facing`); force `top` or `side` only if auto picks wrong'
  },
  steps: [
    ['Once, after the game state exists (before the first draw)',
      '`cloth = GameDNA_Cloth.create({params: {wind: {{wind}}, gust: {{gust}}, stiffness: {{stiffness}}, segments: {{segments}}, damping: {{damping}}, gravity: {{gravity}}, drape: {{drape}}, shade: {{shade}}, outline: \'{{outline}}\', snap: \'{{snap}}\', reduced: \'{{reduced}}\', view: \'{{view}}\'}, scale: <view height> / 360, camera: () => ({x: <camera x>, y: <camera y>})})`. Leave `camera` out when the world is drawn inside a camera transform (then world coordinates = draw coordinates).'],
    ['Attach 2-5 pieces that suit the art (same place)',
      'The player: `cloth.attach(\'player-cape\', {kind: \'cape\', group: \'player\', length: <~0.6 of the sprite height>, width: <~0.8 of its width>, color, trim, anchor: () => <player exists and is shown> ? {x: <shoulder centre, world px>, y: <shoulder y>, facing: <1 | -1>} : null})` (or `kind: \'scarf\'` at the neck, `\'hair\'` at the back of the head). Scenery: `kind: \'banner\'` on a post (anchor = the post top, `facing` = the side it flies to; draw the post yourself), `\'rope\'` or `\'chain\'` from a beam. Top-down game: return `fx, fy` (the unit facing vector) from every actor anchor, which switches that piece to top-down physics; no `ground`. Side view: return only `facing`; a `ground` is the floor under the actor (its feet y), never the screen bottom. Small pixel sprites: 2-3 px wide pieces. If actors are rebuilt on restart, look them up by id inside the anchor function.'],
    ['The fixed update step (the one `?t=` fast-forward and `?auto=1` also run), after movement',
      '`cloth.update(<step ms>)` once per step, on every scene that draws cloth (title, play, menus over the world).'],
    ['Each actor\'s draw (inside the same `globalAlpha` its hurt blink uses)',
      '`cloth.draw(ctx, \'back\', <group>)` right before the sprite (capes, hair), `cloth.draw(ctx, \'front\', <group>)` right after it (scarves). Always pass the group: no group draws every piece. Sprites without an id (title previews) draw no cloth.'],
    ['The scenery pass (where posts, beams and props are drawn)', '`cloth.draw(ctx, \'back\', \'props\')` (or each post\'s own group in a depth-sorted draw). If the game already draws a fixed cape, banner or rope, skip that old drawing with a condition while the cloth runs; keep its code.'],
    ['Swing, dash or blow start (optional, one line)', '`cloth.impulse(<group>, -<facing> * 200, -40)`; a big event (explosion, boss roar): `cloth.gust(2, 900, <dir>)`.']
  ],
  gotchas: [
    'A line or sheet stretched across the screen after a respawn -> the anchor is a stale copy instead of a function, or `teleport` was set huge; anchors are functions, leave `teleport` at 0 (auto).',
    'Cloth slides away from its actor while the camera scrolls -> the anchor is in screen coordinates while `camera` is also passed (or the reverse); anchors are world px, pass `camera` only when the game subtracts the camera by hand.',
    'Every cape in the level appears on one actor -> `draw(ctx, \'back\')` without a group; pass the actor\'s group, skip id-less preview sprites.',
    'Enemy ribbons stay where the enemies stood at the start of a new game -> the anchor closure keeps the old actor object; look the actor up by id inside the function.',
    'Cloth freezes, moves faster at high refresh rates, or `?t=` frames differ between runs -> `update` sits in the render loop or is skipped on some scene; call it once per fixed step.',
    'Half-pixel blur on a pixel game -> `snap` is `smooth` or smoothing is on for that canvas; leave `auto` with `imageSmoothingEnabled = false`.',
    'A top-down cape covers the face when walking toward the camera -> return `layer: fy < -0.3 ? \'front\' : \'back\'` from the anchor (or attach with `layer: \'auto\'`).',
    'The old fixed cape still shows under the new one -> skip the old drawing with a condition while the cloth runs.',
    'A top-down cape or scarf sticks out stiffly sideways or upward -> the anchor returns no `fx, fy`, so the piece uses side-view physics (lift, motion air); return the facing vector.',
    'The cape is held at the bottom of the screen while the hero falls into a pit -> `ground` was the screen bottom; pass the floor under the actor or leave `ground` out.'
  ],
  checks: [
    'Standing: the cape hangs and stirs in the wind; banners fly with folds; ropes and chains sway.',
    'Running: the cape trails behind the actor; after a turn it is on the new back (never flipped over the head); a swing whips it.',
    'Respawn or restart: the cloth is at the new position at once, with no line or sheet across the screen.',
    'Pixel game: whole pixels with a 1 px outline; HD game: smooth shaded cloth. HUD and windows are drawn over all cloth.',
    '`?auto=1` reaches the same ending at the same time as without the element.'
  ],
  selfcheck: [
    '`cloth.update` runs once per fixed step, after movement, inside the step; no game logic reads `points()`, `list()` or `lastDrawn()`.',
    'Every anchor returns world px of something that exists, or `null`; none falls back to 0 or the screen centre.',
    'Every actor `draw` call passes a group; capes / hair before the sprite, scarves after it.'
  ],
  offers: {
    'anchor': 'Cloth pieces hang from actor anchors: `cloth.tip(id)` gives a rope or chain\'s free end, `cloth.wind(x, y)` the current wind (px/s) for particles, grass or smoke that should lean the same way.'
  },
  wants: {
    'hit-site': { title: 'hit sites', text: 'Also call `cloth.impulse(<target group>, <blow direction> * 220, -60)` there, once per accepted hit, so the struck actor\'s cape or ribbon whips.', check: 'A struck actor\'s cape or ribbon whips away from the blow.' },
    'freeze': { title: 'hit-stop', text: 'Call `cloth.update(...)` only on steps the world runs (inside the gate), so cloth holds still during a hit-stop.', check: 'During a hit-stop the cloth holds still with the rest of the world.' },
    'battle-start': { title: 'reset', text: 'Call `cloth.clear()` there (pieces re-pose at their next anchors).' }
  }
};
