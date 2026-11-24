// Basket hint for J-01 dynamic-lights: how to wire the module into an UNKNOWN game, by role. Requires I-08 webgl-post.
export default {
  stage: 'effects',
  does: 'Real-time 2D lighting on top of the WebGL post-process pipeline (I-08, required: `webgl-post.js` is shipped with it and loads first). The world gets darker where no light reaches; point lights and spotlights with soft falloff, colour and flicker light it; a torch rides on the hero, projectiles carry their light, impacts flash; walls and obstacles cast soft shadows. A light map is composited in a WebGL pass, so the HUD stays unlit. Without WebGL, or with `?webgl=0` / `?lights=0`, the game looks exactly as before.',
  params: {
    ambient: 'create `params.ambient` (pick for the scene: day 0.9, dusk 0.55, night 0.3, dungeon 0.15)', tint: 'create `params.tint`',
    shadows: 'create `params.shadows`', softness: 'create `params.softness` (penumbra px)', glow: 'create `params.glow`',
    flicker: 'the hero torch\'s `flicker` (fires 0.35)', bands: 'create `params.bands` (0 smooth, 3-8 banded)'
  },
  steps: [
    ['Load order', '`<script src="webgl-post.js">` then `<script src="dynamic-lights.js">`, both before the game script. One `GameDNA_Post` instance on the game canvas (create it if the game has none: `GameDNA_Post.create({canvas, clock})`).'],
    ['Once, after the canvas and the post instance exist, before any reset code that calls `lights.clear()`',
      '`lights = GameDNA_Lights.create({canvas, post, clock: () => <frame counter> * <step ms>, camera: () => ({x: <camX> - <field offset x>, y: <camY> - <field offset y>}), solidAt: (tx, ty) => <tile blocks light: walls, trees, houses, rocks, platforms; not water or floor>, tile: <tile px>, uiRects: () => [<HUD plates, open text box, menu rects in canvas px; NOT text drawn straight on the world>], when: () => <a world screen is showing, incl. a result box over it>, params: {ambient: {{ambient}}, tint: \'{{tint}}\', shadows: \'{{shadows}}\', softness: {{softness}}, glow: {{glow}}, bands: {{bands}}, wallLight: <wall-face height px>}})`. `camera` is the WORLD point drawn at canvas (0, 0). Obstacles that are not tiles go in `rects: () => [{x, y, w, h}]` (world px). Side-scroller with sky / parallax: call `lights.markFar()` in the draw right after the sky and parallax layers, before tiles and actors.'],
    ['Where a level, scene or run STARTS (and spawns)',
      '`lights.clear()`, then `lights.add({id: \'hero-torch\', follow: () => <hero>, offset: {x, y}, radius: <~4 tiles>, color: \'#ffb066\', flicker: {{flicker}}})` and the level\'s fixed sources (lamps, fires with flicker 0.35, crystals). Projectiles when spawned: `lights.add({follow: () => shot.alive ? shot : null, radius, color})`. Never `add` every frame.'],
    ['Where an impact, kill or spell is ACCEPTED (once)', '`lights.flash({x, y, radius, color, ms: 300})` in world px. It only shows while `when()` is true: hits on a separate battle screen stay unlit.'],
    ['EVERY draw path (title, play, result, the single draw after the `?t=` fast-forward)', '`lights.render()` once per drawn frame (it calls `post.render()`).']
  ],
  gotchas: [
    'The torch pool sits beside the hero or slides when scrolling -> `camera()` must be the world point at canvas (0, 0), HUD offset included.',
    'Shadows in odd places -> `solidAt` got pixels instead of tile indices, or water / floor counted as walls.',
    'Title or a separate battle screen goes dark -> `when()` must be false there.',
    'HUD plate dimmed -> its rect is missing from `uiRects`.',
    'A bright box or band behind HUD text or a message in the dark scene -> that text has no plate: drop its rect (it is lit like the world and stays readable) or give it a small backing box and mask the box; never a full-width strip with nothing behind it.',
    'Light pools on the sky or far mountains of a side-scroller -> call `lights.markFar()` right after drawing the sky / parallax.',
    'Frame time climbs, lights pile up -> `add()` called every frame; add at spawn / level start.',
    'Nothing lights, `lights.stats().reason` is `no-post-module` -> `webgl-post.js` must load first.'
  ],
  checks: [
    'Unlit areas darker; the hero torch\'s flickering pool moves exactly with the hero; walls cast soft shadows away from each light; HUD crisp and unlit.',
    'With `?webgl=0` and `?lights=0`: the plain game; `?auto=1` ends the same with lights on and off.'
  ],
  selfcheck: [
    'Walk `camera()`: hero at world (200, 120), camera (72, 40) -> torch at canvas (128, 80), on the hero.',
    'Every draw path ends with `lights.render()`; lights are added at spawn / level start; `lights.clear()` at level start; flashes once per event.',
    'Walk one light: unlit pixels at {{ambient}} of their colour; intensity 1 adds 1.0 x the light colour at its centre, 0.38 x at half radius, 0 at the rim.'
  ],
  wants: {
    'hit-site': { title: 'hit sites', text: 'Call `lights.flash({x, y, radius: 60, color: \'#ffd8a0\', ms: 250})` there too (world px) for killing blows and spells, once per event.', check: 'Killing blows and spells briefly light their surroundings.' },
    'ui-rects': { title: 'UI rects', text: 'Return the same rects from `lights.uiRects` (canvas px) so those windows stay unlit; only plates and boxes, not text drawn straight on the world.', check: 'The other element\'s windows and text are never dimmed or tinted by the lighting.' },
    'battle-start': { title: 'reset', text: 'Call `lights.clear()` there and add that scene\'s lights again.' }
  }
};
