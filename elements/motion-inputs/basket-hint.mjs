// Basket hint for A-07 motion-inputs: how to wire the module into an UNKNOWN real-time game, by role.
// (The coordinator copies this file to tools/basket/motion-inputs.mjs.)
// The module never moves the hero: it reads the input once per fixed step, recognises motions and calls the game's attack.
export default {
  stage: 'input',
  does: 'Fighting-game special moves: reads the stick and buttons every fixed step into an input buffer and recognises motions relative to the hero\'s facing (236 quarter circle, 623, [4]6 charge, 360), with leniency windows and a busy buffer; a recognised special calls the game\'s own attack and consumes the button. An input display in the game\'s style (arrows, button coins, hold counts, a callout naming the special or TOO SLOW, an optional mirrored move list) stays readable on phones and clear of the hero and HUD.',
  params: {
    moves: 'create `moves: [{{moves}}]`', turnWithInput: 'create `params.turnWithInput` (`on` when the hero turns with left / right)', moveList: 'create `params.moveList`',
    stepWindow: 'create `params.stepWindow`', pressWindow: 'create `params.pressWindow`', gap: 'create `params.gap`', chargeFrames: 'create `params.chargeFrames`',
    buffer: 'create `params.buffer`', display: 'create `params.display`', callout: 'create `params.callout`', rows: 'create `params.rows`', side: 'create `params.side`',
    render: 'create `params.render` (keep `auto`)', theme: 'create `params.theme`'
  },
  steps: [
    ['Once, before the first fixed step',
      '`mi = GameDNA_MotionInputs.create({buttons: {A: \'<the attack field of the input object>\'}, moves: [{{moves}}], params: {turnWithInput: \'{{turnWithInput}}\'}, view: {w: VIEW_W, h: VIEW_H}, canvas, onSpecial: m => startSpecial(m.id), canAct: () => <hero free to attack>, avoid: () => [<hero box, camera applied, view units>], uiRects: () => [<HUD and window boxes>]})`.'],
    ['Input read', 'Add `up` / `down` to the input object if the game never read them (keep every existing key and touch zone).'],
    ['The fixed step, after reading the device and before the game uses it (also in ?t= fast-forward)',
      '`raw.facing = hero.facing; const inp = playing ? mi.step(raw, {fire: !autopilot}) : raw;` and use `inp`; the autopilot keeps its own input.'],
    ['The hero\'s attack code', '`startSpecial(id)`: one branch per move id with the game\'s own damage rules (a projectile, a rising hitbox, a dash hitbox) and a visible effect; return `false` while the hero cannot start it.'],
    ['Render, last while playing', '`mi.draw(ctx)` in the HUD\'s units.'],
    ['New run / restart', '`mi.reset()`.']
  ],
  gotchas: [
    'Nothing fires -> the input object has no up / down, or `buttons` names a field the input does not have.',
    'Back motions fire the wrong way in a platformer -> `turnWithInput: \'on\'` (the hero turns with the push before the game turns him).',
    'A special also swings the normal attack -> the game uses its raw input instead of the value `step()` returned.',
    '`?auto=1` ends differently -> the autopilot\'s input went through `step()` with specials on: `{fire: false}`.',
    'A rolled 360 jumps instead -> the game jumps on up: keep its jump start open while `mi.jumpHold() > 0`.',
    'The display covers the hero -> `avoid()` in world coordinates (camera not applied) or empty.'
  ],
  checks: [
    'Down, down-forward, forward + attack fires the 236 special with its effect and the callout names it; facing the other way, the mirrored motion fires it too.',
    'Walking, jumping and plain attacks never fire a special; `?auto=1` ends as before; the display is readable at 390 px and never over the hero or HUD.'
  ],
  selfcheck: [
    '`step` once per fixed step with `left right up down facing` and the button field; never in draw.',
    '`startSpecial` handles every move id; `reset()` on every restart path.'
  ],
  offers: {
    'ui-rects': { title: 'input display rects', text: '`mi.lastDrawn()` lists the history rows, callout and move list; add them to the other element\'s UI rects so toasts or numbers never land on them.' },
    'hit-site': { title: 'special hits', text: 'Specials land through the game\'s own damage code, so damage numbers, hit sparks and shake on the hit site show for them too.' }
  },
  wants: {
    'ui-rects': { title: 'HUD rects', text: 'Add the other element\'s on-screen boxes (minimap, toasts, boss bars) to `uiRects()` so the display moves out of their way.', check: 'The input display never covers the other element.' },
    'freeze': { title: 'hit-stop / pause', text: 'Do not call `mi.step` while the world is frozen or paused (windows count steps).', check: 'A motion typed across a hit-stop still fires.' }
  }
};
