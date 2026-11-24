// Basket hint for J-08 screen-distortion: how to wire the module into an UNKNOWN game, by role. Requires I-08 webgl-post.js.
export default {
  stage: 'effects',
  does: 'The finished frame bends on the I-08 WebGL post layer: heat haze rising over fires and lava, a slow wobble over water, a swirling lens inside portals and gates, and shockwave rings that refract the scene outward from explosions, slams and kills. One pass that only moves where pixels are read from; HUD rects never bend. **It requires I-08: `webgl-post.js` is shipped in this basket and must load before `screen-distortion.js`.** If the game (or another basket element) already creates a `GameDNA_Post` instance, create it first and pass it as `post`. Without WebGL, or with `?webgl=0`, nothing changes.',
  params: {
    strength: 'create `params.strength` (0..2)', heat: 'create `params.heat` (px at a 360 px view)', water: 'create `params.water`', portal: 'create `params.portal`',
    wave: 'create `params.wave` (shockwave swell)', waveRadius: 'create `params.waveRadius` (shockwave reach)', chroma: 'create `params.chroma` (colour fringe; 0 for pixel art)',
    shine: 'create `params.shine` (faint light on fronts and rims; 0 = pure UV)'
  },
  steps: [
    ['Page head, before the game script', 'Load `webgl-post.js`, then `screen-distortion.js`, both verbatim.'],
    ['Once, after the game canvas exists (and after the game\'s own `GameDNA_Post.create`, if any)',
      '`fx = GameDNA_Distort.create({canvas: <the game canvas> (or post), clock: () => <frame counter> * <step ms>, params: {strength: {{strength}}, heat: {{heat}}, water: {{water}}, portal: {{portal}}, wave: {{wave}}, waveRadius: {{waveRadius}}, chroma: {{chroma}}, shine: {{shine}}}, regions: () => <heat / water / portal shapes drawn now, on-screen, camera subtracted>, uiRects: () => <every HUD element and open window drawn now, tight rects, panel or not>})`. If the game draws with a scale (a devicePixelRatio backing store), add `view: {w, h}` and give everything in those units. `regions` and `uiRects` must only read state.'],
    ['Where an explosion, slam, heavy hit, critical or kill is ACCEPTED (once)', '`fx.shockwave(x, y, {strength: 0.5 light / 0.8 heavy / 1-1.4 kill, explosion, boss stomp})` at the on-screen contact point.'],
    ['EVERY draw path (title, play, pause, result, and the single draw after the `?t=` fast-forward)', '`fx.render()` as the last line.'],
    ['Where a level, battle, life or run STARTS', '`fx.clear()`.']
  ],
  gotchas: [
    'The shimmer slides with the camera or sits beside the fire -> regions in world coordinates; subtract the camera exactly like the game\'s draw (and use `view` units on a scaled backing store).',
    'The whole screen wobbles all the time -> a full-screen region; cover only the water as drawn, or use `params.underwater` for a level that is entirely under water.',
    'A blur of stacked rings -> `shockwave` inside a per-frame overlap loop or on every light hit; once per accepted event.',
    'HUD text bends when a ring passes -> that element is missing from `uiRects`; plate-less text needs a rect too (it leaves no visible box).',
    'Frozen `?t=&freeze=1` frames lack the wave -> `clock` is wall time, or the draw after the fast-forward skips `fx.render()`.',
    'Heat haze invisible -> the rect covers a smooth sky; include the source and the detailed scenery behind it.',
    'A game with nothing hot, wet or gate-like -> shockwaves only; never invent regions over empty ground.'
  ],
  checks: [
    'Hot, wet and gate things shimmer, wobble or swirl in place and follow the camera; nothing else bends.',
    'Each explosion, slam or kill sends one ring outward from its contact point that fades within a second; HUD text never bends.',
    'With `?webgl=0`: looks and plays exactly as before; `?auto=1` ends the same with WebGL on and off.'
  ],
  selfcheck: [
    'Load order `webgl-post.js` -> `screen-distortion.js` -> game; exactly one `GameDNA_Post.create` for the canvas.',
    'Every draw path ends with `fx.render()`; `clock` is the step counter; `shockwave` sits at one-off events.',
    'Walk one wave at a 360 px view: strength 1 reaches {{waveRadius}} px over 650 ms; at 325 ms the radius is 87.5 % of that and the swell {{wave}} x 0.25 px; a 180 px tall game: half the distances.'
  ],
  wants: {
    'ui-rects': { title: 'HUD rects', text: 'Pass the same HUD / window rects to distortion as `uiRects` (on-screen units; include plate-less HUD text) so HUD pixels never bend.', check: 'HUD text stays still while a shockwave crosses it.' },
    'hit-site': { title: 'big hits', text: 'Call `fx.shockwave(x, y, {strength})` there too, once per accepted heavy hit, kill or explosion (0.5-1.4), at the on-screen contact point.', check: 'A killing blow sends one ring from its contact point.' },
    'battle-start': { title: 'reset', text: 'Call `fx.clear()` there.' }
  }
};
