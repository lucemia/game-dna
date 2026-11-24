# Add dynamic 2D lights and soft shadows to my game

Defaults (change any before pasting):
`{{ambient}}` = 0.55 · `{{tint}}` = dusk · `{{shadows}}` = on · `{{softness}}` = 5 · `{{glow}}` = 0.35 · `{{flicker}}` = 0.25 · `{{bands}}` = 0

---

You get two modules with READMEs: `webgl-post.js` (`GameDNA_Post`) and `dynamic-lights.js` (`GameDNA_Lights`). **Include both verbatim** with `<script src>`, `webgl-post.js` first, before the game script. Read the lights README first.

The game keeps drawing on its 2D canvas; a WebGL layer multiplies it by a light map. Add code only; never rename or delete functions; do not change the canvas, its CSS or transform.

**First, map my game**: frame counter; every draw path (incl. the draw after the `?t=` fast-forward); camera and play-field offset; wall tiles; HUD plates; hero, light sources, projectiles, explosions; level start.

**Integration points**

1. **Create once** after the canvas exists (and `post = GameDNA_Post.create({canvas, clock})` if the game has none):
```js
const lights = GameDNA_Lights.create({
  canvas, post, clock: () => <frame counter> * <step ms>,
  camera: () => ({ x: <camX> - <field offset x>, y: <camY> - <field offset y> }), // world point at canvas (0,0)
  solidAt: (tx, ty) => <tile blocks light>, tile: <tile px>, // and/or rects: () => [{x,y,w,h}] world px
  uiRects: () => [<HUD plates, open text box, menu rects, canvas px>],
  when: () => <a world screen is showing, incl. result boxes over it>,
  params: { ambient: {{ambient}}, tint: '{{tint}}', shadows: '{{shadows}}', softness: {{softness}}, glow: {{glow}}, bands: {{bands}}, wallLight: <wall-face height px> }
});
```
   Ambient: day 0.9, dusk 0.55, night 0.3, dungeon 0.15. Walls, trees, houses, rocks, platforms block light; water and floor do not.
   `uiRects`: mask only HUD with its own plate (bar, panel, box). Text drawn straight on the world (score over the sky, a message on the ground, titles): leave unmasked; a rect shows as an unlit box. Never a full-width strip with nothing behind it.
   Side-scroller: call `lights.markFar()` right after drawing sky/parallax, so lights do not paint pools on the sky.
2. **Lights**, added where things are created, never every frame:
   - hero: `lights.add({ id: 'hero-torch', follow: () => <hero>, offset: {x, y}, radius: <~4 tiles>, color: '#ffb066', flicker: {{flicker}} })`;
   - lamps, fires (flicker 0.35), crystals at level start;
   - projectiles: `lights.add({ follow: () => shot.alive ? shot : null, radius, color })`;
   - impacts, kills, spells: `lights.flash({ x, y, radius, color, ms: 300 })` once, where accepted (world px; only shows on `when()` screens).
3. **Render**: `lights.render()` as the last line of EVERY draw path.
4. **Reset**: at level / run start, `lights.clear()`, then re-add that level's lights and the hero torch.

**Keep every other caller working**: `?auto=1` ends as before with WebGL on, `?webgl=0` and `?lights=0`; game logic never reads lights. `?t=<ms>&freeze=1` shows the lit frame.

**Self-check without a browser**
- Modules byte-identical, loaded in order; `clock` step-counted.
- Walk `camera()`: hero at world (200, 120), camera (72, 40) → torch at canvas (128, 80), on the hero, HUD offset included.
- `solidAt` takes tile indices and returns false outside the map.
- `uiRects` covers every HUD, text box and menu; `when` excludes non-world screens.

**Acceptance checks** (screenshots if you can)
1. Unlit areas darker; the torch's flickering pool moves exactly with the hero.
2. Walls cast soft shadows away from each light; faces toward a light are lit.
3. Fires glow, projectiles carry light, impacts flash.
4. HUD plates crisp and unlit, no unlit boxes; title as before.
5. `?webgl=0` / `?lights=0`: the plain game, no errors; `?auto=1` ends as the original.
