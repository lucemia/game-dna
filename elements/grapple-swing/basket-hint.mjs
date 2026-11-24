// Basket hint for B-16 grapple-swing: how to wire the module into an UNKNOWN side-view game, by role.
// (The coordinator copies this file to tools/basket/grapple-swing.mjs.)
// The module never moves the hero: on the rope it returns the velocity; the game keeps its own collision.
export default {
  stage: 'movement',
  does: 'A grappling hook: fire at iron rings (aim assist) or any rock surface, hang on a rope, swing like a pendulum, pump with left / right, reel in and out, jump off or let go keeping the momentum; the rope wraps around corners. The game moves the hero with its own wall tests.',
  params: {
    range: 'create `params.range`', hookSpeed: 'create `params.hookSpeed`', reelSpeed: 'create `params.reelSpeed`', swingForce: 'create `params.swingForce`',
    tighten: 'create `params.tighten`', jumpBoost: 'create `params.jumpBoost`', releaseBoost: 'create `params.releaseBoost`', carryMs: 'create `params.carryMs`',
    aimAssist: 'create `params.aimAssist`', mode: 'create `params.mode` (`hold`: hold the button to hang on)', wrap: 'create `params.wrap`', surfaces: 'create `params.surfaces`',
    render: 'create `params.render` (keep `auto`)'
  },
  steps: [
    ['Once, after the level exists',
      '`grapple = GameDNA_Grapple.create({solid: (x, y) => the game\'s own wall test in WORLD px, tile: TILE, velUnit: \'step\' (px per fixed step) | \'second\', gravity: the game\'s gravity in the same units, scale: VIEW_H / 180, anchors: [3-6 rings {id, x, y} over pits and gaps], bounds: {x: 0, y: -200, w: LEVEL_W, h: LEVEL_H + 400}, drawRings: false, params: {range: {{range}}, swingForce: {{swingForce}}, releaseBoost: {{releaseBoost}}, carryMs: {{carryMs}}, mode: \'{{mode}}\'}})`.'],
    ['Input', 'A free key for the grapple (e.g. C): pressed this step and held; reel in / out on Up / Down if free, else two other free keys. Keep every existing key and touch zone.'],
    ['The start of the hero\'s per-step movement code',
      '`const r = grapple.update(STEP_MS, {fire, hold, jump: jumpPressed, push: right - left, reel}, hero)`; `if (r.active) { hero.vx = r.vx; hero.vy = r.vy; }` and skip the game\'s run acceleration, jump, jump cut and gravity this step; else run them as before, `if (r.flying) hero.vx = r.vx` after the air control and no jump cut. The game\'s own moveX / moveY run unchanged after.'],
    ['Draw, in the hero\'s camera space', '`grapple.drawRings(ctx, camX, camY)` before the hero, `grapple.draw(ctx, camX, camY, hero)` next to it (`0, 0` inside a camera translate).'],
    ['New run, respawn, life lost', '`grapple.reset()`; optional: `grapple.release()` when the hero is hurt.']
  ],
  gotchas: [
    'Hero falls away from the rope -> gravity or the run code still applied after `r.vx, r.vy`; skip them while `r.active`.',
    'Letting go drops straight down -> `r.flying` ignored, or the variable-jump cut clipped the upward speed.',
    'Hook bites air / rope drifts with the camera -> `solid` or rings in screen px, or the camera applied twice.',
    'The world swings around a still hero -> while `grapple.attached()`, ease the camera toward a mix of the anchor and the hero instead of locking it to the hero.',
    'Autoplay ends differently -> code outside the `r.active` / `r.flying` branches changed; the module is inert until the grapple key.'
  ],
  checks: [
    'Fire at a ring: the hook flies, bites, the hero swings and pumps higher; let go: it flies on with the swing\'s speed; jump on the rope: a hop.',
    'Hook rock under a corner: the rope bends around it; the hero never passes through walls; `?auto=1` ends as before; `?t=&freeze=1` is deterministic.'
  ],
  selfcheck: [
    '`update` once per fixed step at the start of the hero code, also during `?t=` fast-forward; never in draw.',
    'World px for `solid`, rings and hero; the camera only in draw; `reset()` on every restart path.'
  ],
  offers: {},
  wants: {
    'hit-site': { title: 'hurt', text: 'Where the hero takes damage, `grapple.release()` so a hit knocks it off the rope.', check: 'A hit while swinging drops the hero off the rope.' },
    'freeze': { title: 'hit-stop / pause', text: 'Skip `grapple.update` (or pass 0) while the world is frozen.', check: 'During a pause the rope holds still.' }
  }
};
