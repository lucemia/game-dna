// Basket hint for I-08 webgl-post: how to wire the module into an UNKNOWN game, by role.
export default {
  stage: 'effects',
  does: 'The game keeps drawing on its 2D canvas exactly as now. The module lays a WebGL canvas exactly over it (same box, clicks pass through, device resolution), uploads each frame and runs shader passes: a filmic grade with warm/cool split toning and a vignette, and a chromatic hit-pulse that splits the colours outward from a hit and fades in game time. Later light and post elements add their own passes to the same instance. Without WebGL, or with `?webgl=0`, it does nothing and the game looks exactly as before.',
  params: {
    passes: 'create `params.passes`', look: 'create `params.look`', vignette: 'create `params.vignette`',
    chroma: 'create `params.chroma` (CSS px of colour split at full pulse)', decay: 'create `params.decay` (ms of game time)',
    sample: 'create `params.sample` (auto follows the canvas CSS: pixelated -> sharp)'
  },
  steps: [
    ['Once, after the game canvas exists and before anything calls `post.clear()`',
      '`post = GameDNA_Post.create({canvas: <the game canvas>, clock: () => <frame counter> * <step ms>, uiRects: () => [<HUD rects, canvas px>], params: {passes: \'{{passes}}\', look: \'{{look}}\', vignette: {{vignette}}, chroma: {{chroma}}, decay: {{decay}}, sample: \'{{sample}}\'}})`. Do not change the canvas size, its CSS, the context transform or smoothing.'],
    ['EVERY draw path (title, play, pause, result screens, and the single draw after the `?t=` fast-forward)',
      '`post.render()` once per drawn frame. It may go first or last in the draw function: the post frame is taken at the end of the task.'],
    ['Every place a hit is ACCEPTED (on the step HP changes, once)',
      '`post.pulse(<0.4 chip / 0.7 normal / 1.2 killing blow or critical>, {at: {x, y}})` with `at` in CANVAS pixels (subtract the camera from world positions).'],
    ['Where a level, battle or run STARTS (not on death or a life restart: it would wipe the killing-blow pulse)', '`post.clear()`.']
  ],
  gotchas: [
    'A screen frozen on an old picture, or `post.stats().watchdog` climbing -> that draw path has no `post.render()`.',
    'HUD text fringed by the pulse or tinted by the grade -> `uiRects` missing or not in canvas px. Every light / post element in the basket shares one `uiMask` input: give them all the same rects.',
    'An ungraded (or unlit) box around HUD text -> a rect masks text that has no panel behind it. Mask the panel, not the text: leave plate-less text unmasked or give it a backing box (a `soft` rect still shows as a patch).',
    'A `?t=&freeze=1` screenshot without the grade -> the single draw after the fast-forward does not reach `post.render()`.',
    'The pulse spreads from the wrong place on scrolling levels -> `at` was in world coordinates.',
    'Freeze frames differ between runs -> `clock` reads wall-clock time; use the step counter.',
    'The game ends differently with `?webgl=0` -> game logic must never read `post.active` or the overlay.'
  ],
  checks: [
    'With WebGL: deeper shadows, a warm/cool tone and darker corners, the HUD still readable; a hit briefly splits the colours outward from the contact point.',
    'With `?webgl=0`: the game looks and plays exactly as before; `?auto=1` ends the same with WebGL on and off.'
  ],
  selfcheck: [
    'Every draw path ends with (or starts with) `post.render()`; `clock` is the step-counted game time.',
    'Every damage site calls `post.pulse` once with a canvas-pixel point; walk `pulse(0.7)`: 3.5 px split at the edges, a quarter of it 130 ms later, gone at 260 ms.'
  ],
  wants: {
    'ui-rects': { title: 'HUD rects', text: 'Pass the same HUD / window rects to the post stage as `uiRects` (canvas px): its grade and hit pulse leave them untouched.', check: 'The HUD looks the same with and without the post stage, even during a hit pulse.' },
    'hit-site': { title: 'hit sites', text: 'Call `post.pulse(strength, {at})` there too, once per landed hit, with the contact point in canvas pixels.', check: 'Every landed hit briefly splits the colours outward from its contact point.' },
    'battle-start': { title: 'reset', text: 'Call `post.clear()` there.' }
  }
};
