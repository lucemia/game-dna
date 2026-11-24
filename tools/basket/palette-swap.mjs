// Basket hint for D-01 palette-swap: how to wire the module into an UNKNOWN game, by role.
export default {
  stage: 'effects',
  lead: 'Use the palette variants exactly for: {{uses}}. Do not recolour anything else.',
  does: 'Recoloured variants of sprites the game already has, with no new art: the module finds each sprite\'s colour ramps and maps them dark-to-light onto new ramps (team blue / red / green / yellow, elite, rare), or tints the whole sprite (poison, petrify, frozen, a pulsing low-HP red, a greyed "already acted" look). Names combine with `+` (`team-red+spent`). Each (sprite, variant) is built once and cached; the game only swaps the image argument of its existing draw call.',
  params: {
    uses: 'which sprites get which looks (shown at the top)',
    hueTol: 'create `params.hueTol`', protectSkin: 'create `params.protectSkin`', target: 'create `params.target`',
    strength: 'create `params.strength`', pulseHz: 'create `params.pulseHz`', pulseSteps: 'create `params.pulseSteps`',
    spentDim: 'create `params.spentDim`', keepOutline: 'create `params.keepOutline`', elite: 'create `params.elite`', eliteEdge: 'create `params.eliteEdge`'
  },
  steps: [
    ['Once, after the sprites are baked (canvases, loaded images, or `{rows, pal}` string sprites)',
      '`PS = GameDNA_PaletteSwap.create({params: {hueTol: {{hueTol}}, protectSkin: \'{{protectSkin}}\', target: \'{{target}}\', strength: {{strength}}, pulseHz: {{pulseHz}}, pulseSteps: {{pulseSteps}}, spentDim: {{spentDim}}, keepOutline: \'{{keepOutline}}\', elite: \'{{elite}}\', eliteEdge: \'{{eliteEdge}}\'}})`.'],
    ['One name function next to the sprite drawing',
      'Derive the look from state the game already has, e.g. `looks(u)` → `team-blue` / `team-red`, `+spent` when it has acted during the current phase of its own side, `+poison` while poisoned, `+lowhp` below a quarter HP, `elite` for elites. For `spent`, reuse the game\'s own done/acted flag and its own guard (e.g. only while the player phase runs); a flag you add is cleared for a side where that side\'s phase ENDS (where the game resets its per-turn flags), never later. For other missing looks add a plain visual flag that no rule reads (set where the state begins, cleared where it ends); never call the game\'s RNG for it. Let detection pick the ramps: no `setRamps` unless a sprite visibly fails.'],
    ['Every draw site of those sprites (map, battle, menus, portraits, death fade, mirrored foes). Grep every `drawImage` of them',
      'Change only the image argument: `drawImage(PS.variant(sprite, looks(u)), ...)`, the same variant in every pass that redraws the sprite (normal and additive hit-flash overlay). Keep transforms, flips, alpha and composite modes. Stop drawing the game\'s own pre-baked art for a look you replaced (its grey "acted" sprite); keep pure white flash frames.'],
    ['Your fixed update step (the one the animation loop, the `?t=&freeze=1` fast-forward and autoplay all call)', '`PS.update(1000 / 60)` once per step (the low-HP pulse clock).']
  ],
  gotchas: [
    'Nothing changes colour and the console says "unknown variant" -> the name is not in the list (or has a typo); use a listed name or `define()` it first.',
    'Frame rate drops and the console warns about many new sprite objects -> a canvas is made inside the draw function and passed in; pass the baked sprite object.',
    'The variant shows stale pixels after the game repaints a sprite canvas -> `PS.invalidate(sprite)` after the repaint.',
    'Faces or hands take the team colour -> set `protectSkin: \'on\'`, or `PS.setRamps(sprite, {primary: [cloth colours dark -> light]})`.',
    'Only part of a garment changes -> its shading is hue-shifted more than `hueTol`; raise it or list the ramp with `setRamps`.',
    'The low-HP pulse never moves, or frozen frames differ -> `update()` is not in the fixed step.',
    'The white hit flash turned into a coloured flash -> the variant was applied to the game\'s pure white flash frame; keep that frame as it was.',
    'The hit flash blends the old colours over the team colour -> an overlay pass still redraws the base sprite; give it the same variant.',
    'Enemies stay grey through the whole player phase -> an added acted flag is cleared when the enemy phase begins again; clear it where that side\'s phase ends (where the game resets its own per-turn flags), or reuse the game\'s flag and guard.',
    'Part of a garment keeps its old colour (a hood stays green) -> `setRamps` listed only some colours; drop it and let detection pick the ramps.'
  ],
  checks: [
    '{{uses}}: each named look is visible on the right sprites and nothing else changed colour; faces and outlines keep their colours.',
    'A look changes on the frame its state changes (acting, a status starting or ending, HP crossing the threshold) and goes back when it ends; the low-HP pulse breathes.',
    'Walk a turn: during the player phase no enemy is `spent`, during the enemy phase no player unit is, and the next turn starts with nobody spent.',
    '`?t=<ms>&freeze=1` gives the same frame every time; `?auto=1` ends exactly as before, no console errors or warnings.'
  ],
  selfcheck: [
    'Grep `variant(`: only in draw code, as the image argument, at every draw site of the affected sprites; its first argument is a long-lived sprite object.',
    'Every name is from the list (`base`, `team-blue|red|green|yellow`, `elite`, `rare`, `poison`, `petrify`, `frozen`, `lowhp`, `spent`, joined with `+`); flags you added are read only by the name function.',
    'Grep `update(`: once per fixed step. No rule, timer or RNG call changed.',
    'Walk one case: an enemy that has acted -> `variant(sprite, \'team-red+spent\')` -> its clothing ramp turns red, then all but the outline greys at {{spentDim}} brightness.'
  ],
  offers: {},
  wants: {}
};
