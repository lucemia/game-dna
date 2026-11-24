// Basket hint for J-02 normal-lighting: how to wire the module into an UNKNOWN game, by role. Requires I-08 webgl-post.js.
export default {
  stage: 'effects',
  does: 'Sprites catch the light on the I-08 WebGL post layer: every sprite drawn through the module writes its normals (an L-05 / any normal map, or derived from the drawn shape), and one pass relights only those pixels from a key light, lamps, hit flashes and J-01 lights, with glints and a rim light. Faces turned to the viewer keep their drawn colour. **It requires I-08: `webgl-post.js` is shipped in this basket and must load before `normal-lighting.js`.** If the game (or another basket element) already creates a `GameDNA_Post` instance, create it first and pass it as `post`. Without WebGL, or with `?webgl=0`, every sprite draws exactly as before.',
  params: {
    preset: 'create `params.preset`: daylight (no lamps or darkness) / dusk / night (lamps, torches, J-01) / soft', strength: 'create `params.strength` (relief, 0..2)',
    key: 'create `params.key` (key light)', keyAngle: 'create `params.keyAngle` (degrees the key light comes FROM)', keyHeight: 'create `params.keyHeight` (0.1 raking .. 0.95 flat)',
    warmth: 'create `params.warmth` (warm key / cool shadow tint, 0 = brightness only)', rim: 'create `params.rim`', bevel: 'create `params.bevel` (view px rounding of derived shapes)'
  },
  steps: [
    ['Page head, before the game script', 'Load `webgl-post.js`, then `normal-lighting.js`, both verbatim.'],
    ['Once, after the game canvas exists (and after the game\'s own `GameDNA_Post.create`, if any)',
      '`nl = GameDNA_NormalLight.create({canvas: <the game canvas>, post: <existing post, if any>, clock: () => <frame counter> * <step ms>, camera: () => ({x: <camera x>, y: <camera y>}), params: {preset: \'{{preset}}\', strength: {{strength}}, key: {{key}}, keyAngle: {{keyAngle}}, keyHeight: {{keyHeight}}, warmth: {{warmth}}, rim: {{rim}}, bevel: {{bevel}}}})`; preset `daylight` for a game without lamps or darkness, `dusk` / `night` (pass only `preset`) with lamps, torches or J-01 darkness. A scaled (devicePixelRatio) backing store: add `view: {w, h}`.'],
    ['Where each SPRITE is drawn (characters, enemies, NPCs, props, pickups, trees, rocks), inside the camera transform and the sort order',
      'Bitmap: `nl.drawSprite(img, normalMap | \'derive\', ...same drawImage args)`. Canvas-drawn: wrap the existing call, `nl.shape(null, {x, y, w, h} around the sprite in the current drawing coordinates, () => drawIt())`; unchanging things (trees, rocks, crates, coins) get a string key such as `\'tree\' + col + \',\' + row` so they are derived once. Never ground, sky, backgrounds, HUD or a whole-world draw.'],
    ['Level / run START', '`nl.clear()`, then `nl.add({id, x, y, radius, color, flicker})` per lamp or torch (world units); `follow: actor` for carried lights.'],
    ['Where a hit, spell or explosion is ACCEPTED (once)', '`nl.flash({x, y, radius: 110, color: \'#ffd28a\', ms: 260})` at the world point.'],
    ['EVERY draw path (title, play, pause, result, early returns, and the single draw after the `?t=` fast-forward)', '`nl.render()` as the last line.']
  ],
  gotchas: [
    'Nothing changes -> `nl.render()` missing on that draw path, or the sprites are still drawn with plain `drawImage` / not wrapped.',
    'A sprite is lit only in a rectangle -> its `shape` box is too small or in other coordinates; box the whole sprite in the coordinates active at the call (inside the camera transform).',
    'Ground or background has pillow edges -> it was wrapped; sprites only.',
    'Frame time climbs -> many static shapes derive every frame; give unchanging things a string key (never key an animated actor).',
    'Lights slide with the camera -> `camera` missing or not the offset the draw subtracts.',
    'Frozen `?t=&freeze=1` frames are flat -> the draw after the fast-forward skips `nl.render()` or an early return skips it.',
    'A blur of flashes -> `flash` inside a per-frame overlap loop; once per accepted event.'
  ],
  checks: [
    'At 1x, wrapped sprites look rounded: warm and brighter toward the key (up-left) and lamps, cool and darker away, about as bright and saturated overall as before; ground, sky and HUD unchanged.',
    'A hit flashes light on nearby sprites, fading within a third of a second; sprites facing left are lit from the same side as sprites facing right.',
    'With `?webgl=0`: looks and plays exactly as before; `?auto=1` ends the same with WebGL on and off.'
  ],
  selfcheck: [
    'Load order `webgl-post.js` -> `normal-lighting.js` -> game; exactly one `GameDNA_Post.create` for the canvas.',
    'Every draw path ends with `nl.render()`; `clock` is the step counter; `flash` sits at one-off events; every `begin` has its `end` (prefer `shape`).',
    'Walk one pixel at the defaults: key L.xy = (-0.66, -0.66); a flat pixel is unchanged; an edge facing up-left n.xy = (-0.7, -0.7) gets x 1.54 and warmer, the edge facing down-right x 0.46 and cooler (mean 1.0).'
  ],
  wants: {
    'hit-site': { title: 'hits', text: 'Call `nl.flash({x, y, radius: 110, color: \'#ffd28a\', ms: 260})` there too, once per accepted hit, at the world point.', check: 'A hit flashes light on nearby sprites.' },
    'battle-start': { title: 'reset', text: 'Call `nl.clear()` there and add the level\'s lamps again.' }
  }
};
