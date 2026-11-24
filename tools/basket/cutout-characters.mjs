// Basket hint for L-10 cutout-characters: swap an UNKNOWN game's code-drawn humanoid characters for painted cut-out
// characters moved by a bone rig. The pack (pack.js / pack.json + chars/*.webp, the "pack" layer) is not copied by
// combine.mjs: add it as extra files. The "regenerate" layer adds assets/prompts/templates.md, style-lock.txt,
// assets/rig-config.json and tools/make-pack.py + tools/assets (postproc.py, namecheck.py). The module does not use the
// L-00 loader (GameDNA_Assets); L-00 is required for its style-lock method only.
export default {
  stage: 'effects',
  does: 'Replaces the player character (and any ally or foe a shipped character fits) with a hand-painted HD character built from cut-out parts and animated by a small bone rig: breathing idle, walk, attack with wind-up, strike and recover, hurt recoil, jump, guard, cast, feet planted by IK, a spring cape, a warm key light with a rim. The game\'s own timers drive the poses; rules, hit boxes and timings never change. A character whose art did not load keeps its old drawing.',
  params: { light: 'light', rim: 'IGNORE', shade: 'IGNORE', blendMs: 'IGNORE', shadow: 'IGNORE' },
  steps: [
    ['The game\'s boot (first step, `?t=` fast-forward, first animation frame). Grep every caller',
      'Include `cutout-characters.js` and `pack.js` verbatim. At load time: `const CUT = GameDNA_Cutout.load(window.GameDNA_CutoutPack, {base: \'\'})`, one `CUT.actor(id, {h})` per replaced character (`sword`, `spear` or `mage`; one character each). Replace the boot call with `CUT.onReady(boot)`.'],
    ['The fixed update step, after the replaced character is updated (attack timer, hurt timer, airborne, speed, facing)',
      'hurt -> `actor.pose(\'hurt\', 1 - left / total)`; attack -> `actor.pose(\'slash\', elapsed / total)` (side view; the tip lands 0.65-0.7 h ahead from k 0.22; `\'attack\'` = overhead chop, `\'cast\'` = magic); airborne -> `actor.pose(\'jump\', vy < 0 ? 0.2 : 0.8)`; else `actor.pose(null); actor.loop(moving ? \'walk\' : \'idle\', {speed: |vx| / (CUT.walkSpeed(id) * h)})`. Then `actor.update(1000 / 60, {vx: speedPerSecond, h, facing})`. Restart: `actor.reset()`.'],
    ['Each draw site of a replaced character (feet point, drawn height, facing, hit flash, blink)',
      '`if (!actor.draw(ctx, feetX, feetY, {h, facing, flash: \'auto\', alpha, light: \'{{light}}\', shadow: onGround, swoosh: true})) <old drawing>`. Drop the old body, weapon and swing line; keep effects. `actor.point(\'tip\', feetX, feetY, {h, facing})` = the weapon tip for sparks.']
  ],
  gotchas: [
    'Old drawing on frozen frames -> the boot ran before the atlases loaded; boot from `CUT.onReady`.',
    'Frozen frame differs from play -> `pose` / `play` / `update` called in draw; call them in the fixed step only.',
    'Two weapons on screen -> the old sword / swing arc still drawn; the rig animates its own weapon.',
    'Strike lands at the wrong moment -> map the attack timer over its whole length to k 0..1 (`slash` strikes from k 0.22).',
    'Enemy flashes while the blade is short of it -> use `slash` (forward), not the overhead `attack`, in side-view action.',
    'Feet slide while walking -> loop speed = |vx| / (CUT.walkSpeed(id) * h).',
    'Hit flash is a white rectangle or a long pale wash -> pass `flash: \'auto\'` (crisp, from the hurt pose) instead of filling the game canvas.',
    'Shadow floating under a jumping character -> `shadow: onGround`.',
    'Same picture shown as two characters -> one shipped character per game character; others keep their old drawing.'
  ],
  checks: [
    'The replaced character stands where the old one stood, same height and facing, feet on the ground; it breathes when idle, winds up before it strikes, recoils when hurt.',
    '`?t=<ms>&freeze=1` gives the same frame every time; `?auto=1` ends exactly as before; no console errors.',
    'Deleting an atlas brings back the old drawing for that character only.'
  ],
  selfcheck: [
    'Grep `.draw(ctx`: each cut-out draw sits in `if (!...)` with the old drawing.',
    'Grep `GameDNA_Cutout.load` and `.actor(`: called once, at load time.',
    'Grep `.pose(` / `.play(` / `.update(`: only in the fixed step.'
  ],
  offers: {},
  wants: {}
};
