// Basket hint for I-02 parallax-layers: how to wire the module into an UNKNOWN game, by role.
export default {
  stage: 'foundations',
  does: 'Replaces the flat background with 3-6 generated pixel-art layers (dithered sky, clouds or a cave ceiling, far range, back range, trees / sea stacks / buildings, dark near foliage) that scroll at their own fraction of the camera, tile seamlessly and move by whole pixels, with small ambient motion (drifting clouds, twinkling stars, swaying grass, fireflies, glints, window lights). Themes forest, cliffs, cave, city; day, dusk or night. Static screens get a slow sway.',
  params: {
    theme: 'create `theme` (closest to the game: forest, cliffs = coast, cave, city)', time: 'create `time` (warm sunset palette -> dusk)',
    layers: 'create `params.layers`', depth: 'create `params.depth`', vertical: 'create `params.vertical` (0 unless the camera also moves vertically)',
    ambient: 'create `params.ambient`', drift: 'create `params.drift`', sway: 'create `params.sway` (static screens)', floor: 'create `params.floor`',
    horizon: 'create `params.horizon`', ground: 'IGNORE', idle: 'create `params.idle` (static screens)', detail: 'create `params.detail`'
  },
  steps: [
    ['Once, after the canvas size exists (before the first frame); then `bg.prebuild()`',
      '`bg = GameDNA_Parallax.create({view: {x: 0, y: 0, w: <field width>, h: <field height above the HUD>}, seed: 1, theme: \'{{theme}}\', time: \'{{time}}\', params: {layers: {{layers}}, depth: {{depth}}, vertical: {{vertical}}, ambient: {{ambient}}, drift: {{drift}}, sway: {{sway}}, floor: \'{{floor}}\', ground: <y where the ground tiles start> / <field height>}, getObstacles})`. `view` = the area the old background covered. `getObstacles()` -> living sprites\' screen rects `{x, y, w, h}` (bright ambient pixels keep 3 px away), or `[]`.'],
    ['Your fixed update step (the one `?t=` fast-forward also runs), every scene', '`bg.update(1000 / 60)`. Never real time.'],
    ['The ONE call that paints the old background, on every screen that uses it (title, play, results)',
      'Replace that call (keep the old background code) with `bg.draw(ctx, camX, camY)`: the camera position in world px, the same number the tiles subtract (`worldX - camX`), not negated; `0, 0` without a camera. First in the frame, outside any shake translate.'],
    ['Static screens with a painted ground (side-view battle)',
      'Keep the game\'s ground band: give the module only the area above it (`view.h` = that horizon y, `ground: 1`) and draw the old image\'s band after `bg.draw` (`ctx.drawImage(old, 0, y0, w, h, 0, y0, w, h)`), choosing `y0` below any prop that stands on the old horizon; or use `floor: \'plain\'` with `ground` = where the floor starts. Camera `0, 0`, `sway` 1-3.']
  ],
  gotchas: [
    'Backdrop covers tiles or sprites -> `draw` runs after them; call it first, where the old background was drawn.',
    'Far mountains move as fast as the ground -> the camera was negated or pre-multiplied; pass the camera number the tiles subtract.',
    'Stars, grass and clouds frozen or different in each `?t=&freeze=1` shot -> `update` sits in the render loop or uses real time; put it in the fixed step.',
    'Hitch on the first frame or level start -> call `prebuild()` at load (and after `setTheme`).',
    'Trees float above or sink into the ground tiles -> `ground` = top of the ground tiles / view height (180-px view, tiles at 148 -> 0.82).',
    'Title or result screen went black -> the old background was removed there; draw the backdrop there too.',
    'Screen edges flicker during shake -> draw the backdrop before the shake translate.'
  ],
  checks: [
    'Behind the tiles: dithered sky, far range, a tree / cliff / building line and dark near foliage; no flat colour left; tiles, sprites and HUD on top; pits show the backdrop.',
    'When the camera moves, near layers move faster than far ones, by whole pixels, with no seams or gaps; two `?t=&freeze=1` shots 1 s apart differ only in clouds, stars, grass or lights.'
  ],
  selfcheck: [
    'The old background call is replaced on every screen that drew it, and its code is still there; `bg.draw` is the first paint of each frame with the tiles\' camera numbers; worked example: camera 200 -> far layer moves 32 px (x0.16), mid 96 px (x0.48).',
    '`bg.update` is in the fixed step that `?t=` fast-forward runs; `create` runs once; identifiers in `getObstacles` exist when first called.'
  ],
  offers: {
    'battle-start': 'For a new level or area, `bg.setTheme(theme, time)` then `bg.prebuild()` before its first frame (the backdrop never needs `clear()`).'
  },
  wants: {
    'ui-rects': { title: 'UI rects', text: 'Add them to what `getObstacles()` returns (screen px), so no twinkle sits under a window edge.', check: 'No star, firefly or glint blinks right next to the other element\'s windows or HUD.' },
    'anchor': { title: 'anchors', text: 'Use these positions for the sprite rects in `getObstacles()` (screen px).' }
  }
};
