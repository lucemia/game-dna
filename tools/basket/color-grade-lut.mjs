// Basket hint for J-06 color-grade-lut: how to wire the module into an UNKNOWN game, by role. Requires I-08 webgl-post.js.
export default {
  stage: 'effects',
  does: 'Grades the whole picture through a 3D colour lookup table on the I-08 WebGL post layer: one table per mood (neutral, dusk, night, memory, combat, toxic, all generated in code), blended over game time when the player changes zone, phase or scene, plus a vignette and fine film grain. The HUD stays exactly as drawn. **It requires I-08: `webgl-post.js` is shipped in this basket and must load before `color-grade-lut.js`.** If the game (or I-08 in this basket) already creates a `GameDNA_Post` instance, create it first; this module shares it and turns its built-in grade off (one grade, one vignette). Without WebGL, or with `?webgl=0`, nothing changes.',
  params: {
    preset: 'create `params.preset` and the look used where no zone or phase picks another',
    strength: 'create `params.strength`', blend: 'create `params.blend` (default ms for `to(name)`)',
    vignette: 'create `params.vignette`', grain: 'create `params.grain`',
    builtin: 'create `params.builtin` (replace = the I-08 built-in grade is off; keep = it runs after the LUT without its vignette)'
  },
  steps: [
    ['Page head, before the game script', 'Load `webgl-post.js`, then `color-grade-lut.js`, both verbatim.'],
    ['Once, after the game canvas exists (and after the game\'s own `GameDNA_Post.create`, if any)',
      '`grade = GameDNA_ColorGrade.create({canvas: <the game canvas>, clock: () => <frame counter> * <step ms>, params: {preset: \'{{preset}}\', strength: {{strength}}, blend: {{blend}}, vignette: {{vignette}}, grain: {{grain}}, builtin: \'{{builtin}}\'}, uiRects: () => <HUD bars, open windows, menus and banner plates now, canvas px, {x, y, w, h, r?}>})`; for flat, saturated pixel art use `strength` 0.6-0.75. Mask only HUD drawn on its own backing plate; text drawn straight on the world (title text, name labels) stays unmasked.. Never a second `GameDNA_Post.create` for the same canvas.'],
    ['The fixed step, after state changes (zone, phase, scene)',
      '`grade.to(<look for the current screen, zone or phase (not per turn or attacker)>, <600-1500 ms>)`, e.g. battle screen `combat`, enemy turn `night`, swamp `toxic`, flashback `memory`, evening `dusk`, otherwise `{{preset}}`. Idempotent: calling it every step is fine.'],
    ['Where a new game, level or run STARTS', '`grade.set(<its look>)` (a cut, no fade from the previous screen).'],
    ['EVERY draw path (title, play, pause, result, and the single draw after the `?t=` fast-forward)', '`grade.render()` once per drawn frame (it also renders I-08).']
  ],
  gotchas: [
    'Two overlays, or a game whose I-08 grade still shows -> the colour-grade module was created before the game\'s own `GameDNA_Post.create`; create I-08 first.',
    'The look pumps or keeps restarting its fade -> two looks are requested in the same frame (e.g. at a zone border, or from draw code); decide one look per step from state.',
    'HUD text tinted at night -> `uiRects` missing, in world coordinates, or missing the HUD\'s draw offset (I-08 v1.1+ also keeps its own grade and pulse off the HUD through the same mask).',
    'Ungraded boxes behind title text or battle labels -> those rects mask text with no plate behind it (a `soft` edge does not hide it); leave that text unmasked, give it a small backing box, or keep the title screen neutral. Never a full-width strip or whole-canvas rect with nothing behind it.',
    'Battle look flickers between two moods -> the look is picked per turn or attacker; pick it per screen or phase.',
    'Paths go orange (dusk) or grass neon (toxic) on bright pixel art -> lower `strength` to 0.6-0.75.',
    'Square halos around rounded HUD panels -> give exact panel rects with `r` = the panel corner radius, not padded rects.',
    'Double dark corners -> the game already draws its own vignette; set `vignette: 0` here or remove one.',
    '`?t=&freeze=1` frames differ between runs -> `clock` or `to()` uses wall-clock time; use the step counter.'
  ],
  checks: [
    'Each zone, phase or scene has its own mood (a night look keeps fires and lanterns orange) and switching fades smoothly over the chosen time.',
    'HUD bars, text and item icons look exactly as without the module; one soft vignette, fine grain.',
    'With `?webgl=0`: looks and plays exactly as before; `?auto=1` ends the same with WebGL on and off.'
  ],
  selfcheck: [
    'Load order `webgl-post.js` -> `color-grade-lut.js` -> game; exactly one `GameDNA_Post.create` for the canvas (the game\'s, or none).',
    'Every `to()` is in the fixed step with a preset name; walk `to(\'night\', 1200)`: mix 0, 0.5 at 600 ms, 1 at 1200 ms; every draw path ends with `grade.render()`.',
    'For each screen, `uiRects` returns the rects of what is drawn there, in canvas px.'
  ],
  wants: {
    'ui-rects': { title: 'HUD rects', text: 'Pass the same HUD / window rects to the colour grade as `uiRects` (canvas px) so the grade, vignette and grain leave the HUD untouched.', check: 'The HUD looks identical with and without the colour grade.' },
    'battle-start': { title: 'battle look', text: 'Where a battle starts, the step\'s look picks `combat` (blend 400-600 ms); where it ends, the zone look returns.' }
  }
};
