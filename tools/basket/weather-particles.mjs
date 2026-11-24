// Basket hint for E-06 weather-particles: how to wire the module into an UNKNOWN game, by role.
export default {
  stage: 'effects',
  does: 'Seeded weather in three depth layers: rain that splashes on the game\'s own ground line, snow, dust motes, fireflies that glow at night, fluttering leaves. Far and mid layers are drawn behind the sprites, the near layer in front; a gusting wind pushes everything; `setWeather(kind, ms)` cross-fades; a particle budget caps the count; nothing is drawn over the UI rects. Same clock + camera = same frame.',
  params: {
    weather: 'create `weather`', density: 'create `params.density`', intensity: 'create `params.intensity`', wind: 'create `params.wind`',
    gust: 'create `params.gust`', parallax: 'create `params.parallax`', front: 'create `params.front` (0 = all behind the sprites)',
    night: 'create `params.night` (firefly glow)', shade: 'create `params.shade` (rain / snow darken the backdrop)', fade: 'create `params.fade`',
    cap: 'create `params.cap`', splash: 'create `params.splash`', uiMode: 'create `params.uiMode`'
  },
  steps: [
    ['Once, after the canvas size exists (never per frame or per level)',
      '`wx = GameDNA_Weather.create({view: {x, y, w, h} (the play field, screen px), seed: 1, weather: \'{{weather}}\', params: {density: {{density}}, intensity: {{intensity}}, wind: {{wind}}, gust: {{gust}}, front: {{front}}, night: {{night}}, shade: {{shade}}, cap: {{cap}}}, ground, uiRects})`. Side view: `ground = sx => <screen y of the ground top under screen x, null over a pit>`; top-down: leave `ground` out. `uiRects()` -> every HUD bar and open window in screen px (nulls allowed).'],
    ['Your fixed update step (the one `?t=` fast-forward also runs), every scene with weather', '`wx.update(1000 / 60)`. Never real time; skip it while paused.'],
    ['Right after the background, before tiles and sprites', '`wx.drawBack(ctx, camX, camY)`: the camera the tiles subtract, not negated; `0, 0` without one.'],
    ['After the last sprite or effect, before HUD and windows', '`wx.drawFront(ctx, camX, camY)`. One slot only (map drawn inside a translate): `wx.draw(ctx, camX, camY)` once after it, outside the translate.'],
    ['Where the area or story changes (optional)', '`wx.setWeather(\'snow\', 2000)` (or `\'none\'`); a new game or restart: `wx.setWeather(<start>, 0)`.']
  ],
  gotchas: [
    'Weather over the HUD or a dialog -> that rect is missing from `uiRects`, or `drawFront` runs after the HUD.',
    'Splashes float or sit inside the ground -> `ground` must take a SCREEN x and return a SCREEN y (`groundTop(sx + camX) - camY`).',
    'Splashes over pits -> return `null` for pit columns.',
    'Everything in front of the hero -> only `draw` after the sprites; split into `drawBack` before and `drawFront` after.',
    'Frozen or different in each `?t=&freeze=1` shot -> `update` is in the render loop or uses real time.',
    'Rain slides along with the hero -> camera not passed, or negated.',
    'Weather pops when the level changes -> instance re-created; keep one, use `setWeather`.',
    'Top-down drops all land on one line -> a `ground` was given; omit it.'
  ],
  checks: [
    'Weather in two or more depths (far behind, near over the hero), slanting with the wind; rain splashes on the ground surface, none over pits; no particle within 1 px of the HUD or an open window.',
    'Two `?t=&freeze=1` loads at the same t are identical; `?auto=1` ends as before.'
  ],
  selfcheck: [
    '`wx.update` is in the fixed step; `drawBack` after the background and before the first tile; `drawFront` after the last sprite and before the first HUD call; both with the tiles\' camera.',
    '`ground` worked example: camera 200, ground column 20 (world x 320-335) top at y 148 -> `ground(125)` = 148; pit -> `null`. Identifiers in `ground` / `uiRects` exist at the first draw.'
  ],
  offers: {
    'ui-rects': 'Weather keeps clear of the same rects; pass the other elements\' windows and plates to `uiRects` too.',
    'battle-start': 'A new area or battle: `wx.setWeather(kind, 0)` there for a hard cut, or with ms for a fade (weather never needs `clear()`).'
  },
  wants: {
    'ui-rects': { title: 'UI rects', text: 'Return them from `uiRects()` (screen px) while they are shown.', check: 'No raindrop, flake or leaf crosses the other element\'s windows, plates or HUD.' }
  }
};
