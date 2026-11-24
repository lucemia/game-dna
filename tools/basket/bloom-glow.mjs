// Basket hint for J-03 bloom-glow: how to wire the module into an UNKNOWN game, by role. Requires I-08 webgl-post.js.
export default {
  stage: 'effects',
  does: 'Bright areas bleed soft light on the I-08 WebGL post layer: pixels above a soft-kneed brightness threshold, plus everything the game redraws each frame into an emissive layer (only what should glow: spells, projectiles, lanterns, crystals, coins, a selected button), are blurred at 1/2 to 1/16 resolution and added back, tinted. Big hits can flash the bloom from their contact point. HUD rects never glow and are never washed. **It requires I-08: `webgl-post.js` is shipped in this basket and must load before `bloom-glow.js`.** If the game (or I-08 in this basket) already creates a `GameDNA_Post` instance, create it first and pass it as `post`. Without WebGL, or with `?webgl=0`, nothing changes.',
  params: {
    source: 'create `params.source` (bright daylight, white clouds or lots of white pixel text: `emissive`)',
    threshold: 'create `params.threshold` (0..1)', knee: 'create `params.knee`', intensity: 'create `params.intensity`',
    radius: 'create `params.radius` (0 tight, 1 wide)', tint: 'create `params.tint`', blend: 'create `params.blend` (`screen` on bright scenes)',
    emissiveGain: 'create `params.emissiveGain`'
  },
  steps: [
    ['Page head, before the game script', 'Load `webgl-post.js`, then `bloom-glow.js`, both verbatim.'],
    ['Once, after the game canvas exists (and after the game\'s own `GameDNA_Post.create`, if any)',
      '`post = GameDNA_Post.create({canvas: <the game canvas>, clock: () => <frame counter> * <step ms>, params: {passes: \'none\'}})` unless the game or another basket element already made one; then `bloom = GameDNA_Bloom.create({post, clock: <same>, params: {source: \'{{source}}\', threshold: {{threshold}}, knee: {{knee}}, intensity: {{intensity}}, radius: {{radius}}, tint: \'{{tint}}\', blend: \'{{blend}}\', emissiveGain: {{emissiveGain}}}, uiRects: () => <HUD bars, windows, menus and banners drawn now, canvas px; {.., glow: true} for UI that should glow>})`. If the game draws with a scale, add `view: {w, h}` and give rects in those units.'],
    ['EVERY draw path (title, play, pause, result, and the single draw after the `?t=` fast-forward)',
      '`const e = bloom.emissive()` (cleared once per frame), then mark what glows at its on-screen position (camera subtracted): pickups, units and heal/buff targets get only a `bloom.glow(x, y, r, color, 0.3-0.5)` halo (never the whole sprite redrawn: it turns into a pale blob); only self-lit parts (flame, projectile core, crystal, eye, spell particles) are redrawn with `e.drawImage` / `e.fillRect`; then `bloom.render()`. It may run before or after the game\'s own drawing (the post frame is taken at the end of the task).'],
    ['Where a heavy hit, critical or kill is ACCEPTED (once)', '`bloom.flare(<0.6 heavy / 1.2 finisher or kill>, {at: {x, y}})`, `at` in on-screen units.'],
    ['Where a level, battle, life or run STARTS', '`bloom.clear()`.']
  ],
  gotchas: [
    'The whole sky, white clouds or white HUD text glow -> luminance bloom on a bright scene; use `source: \'emissive\'`, `blend: \'screen\'`, intensity 1.0-1.1, radius 0.6, halos alpha 0.5-0.6.',
    'A lighter or un-bloomed box behind a title or a floating label -> a tight `uiRect` around text drawn with no backing plate; leave plate-less text out of `uiRects` (or draw it a backing box), never one full-canvas or full-width rect.',
    'Coins or a healed hero turn into pale discs or coloured blobs -> the whole sprite was redrawn into the emissive layer; give it only a `glow()` halo at alpha 0.3-0.5.',
    'HUD panels washed or a dark rectangle in the world -> `uiRects` missing or in the wrong units (a 2x backing store needs `view`), or a rect left over from a closed menu.',
    'A glow beside the thing, or sliding with the camera -> emissive drawn in world coordinates; subtract the camera exactly like the game\'s draw.',
    'Glow flickers, or `?t=&freeze=1` shows none -> emissive drawing is missing from a draw path (title, the single draw after the fast-forward) or sits in the update step.',
    'Two overlays, the game looks blurry or double-graded -> `GameDNA_Post.create` called twice for the canvas; create once and pass `post`.',
    'Everything blooms white on every hit -> `flare` inside a per-frame overlap loop; call it once where a big hit is accepted.'
  ],
  checks: [
    'Glowing things (spells, projectiles, lights, pickups) have a soft halo; HUD text and panels look exactly as without the module.',
    'A big hit briefly blooms brighter from its contact point.',
    'With `?webgl=0`: looks and plays exactly as before; `?auto=1` ends the same with WebGL on and off.'
  ],
  selfcheck: [
    'Load order `webgl-post.js` -> `bloom-glow.js` -> game; exactly one `GameDNA_Post.create` for the canvas (the game\'s, or one for bloom).',
    'Every draw path calls `bloom.emissive()` drawing (when something glows) and `bloom.render()`; `clock` is the step counter.',
    'Walk threshold {{threshold}}, knee {{knee}}: brightness 0.9 passes 70 % of its colour, 0.6 passes 12 %, 0.39 and below nothing; `flare(1.2)` makes the wide glow up to 2.44x stronger and fades over 420 ms (a quarter left at 210 ms).'
  ],
  wants: {
    'ui-rects': { title: 'HUD rects', text: 'Pass the same HUD / window rects to bloom as `uiRects` (canvas px; whole backing plates, `r` = corner radius) so HUD pixels never glow and are never washed. Plate-less text stays out.', check: 'The HUD looks identical with and without bloom.' },
    'hit-site': { title: 'big hits', text: 'Call `bloom.flare(strength, {at})` there too, once per accepted heavy hit or kill (0.6 / 1.2), with the contact point in canvas pixels.', check: 'A killing blow briefly blooms brighter from its contact point.' },
    'battle-start': { title: 'reset', text: 'Call `bloom.clear()` there.' }
  }
};
