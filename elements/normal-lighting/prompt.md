# Add normal-mapped sprite lighting to my game

Defaults:
`{{preset}}` = daylight · `{{strength}}` = 1.4 · `{{key}}` = 0.6 · `{{keyAngle}}` = 225 · `{{keyHeight}}` = 0.35 · `{{warmth}}` = 0.6 · `{{rim}}` = 0.7 · `{{bevel}}` = 8

---

You are given `webgl-post.js` (global `GameDNA_Post`), `normal-lighting.js` (global `GameDNA_NormalLight`) and their READMEs. **Include both verbatim**, `webgl-post.js` first, before the game script; never rewrite them.

Sprites catch the light (relief, glints, rim); only sprites drawn through the module change. Add code only; never replace, rename or delete existing functions; never change the canvas size, CSS, transform or smoothing.

**First, map my game**: the canvas and draw scale; the fixed step and frame counter; every draw path (title, play, pause, result, early returns, the draw after the `?t=` fast-forward); the camera; where each sprite is drawn; lamps and torches; where hits are accepted; where a level starts. Reuse any existing `GameDNA_Post`.

**Integration points**

1. **Create**, once, after the canvas exists:
```js
const nl = GameDNA_NormalLight.create({ canvas: <game canvas>, post: <existing GameDNA_Post, if any>,
  clock: () => <frame counter> * <step ms>, camera: () => ({ x: <camera x>, y: <camera y> }),
  params: { preset: '{{preset}}', strength: {{strength}}, key: {{key}}, keyAngle: {{keyAngle}}, keyHeight: {{keyHeight}}, warmth: {{warmth}}, rim: {{rim}}, bevel: {{bevel}} } });
```
   Preset: `'daylight'` without lamps or darkness; `'dusk'` or `'night'` (then pass only `preset`) with lamps, torches or J-01 darkness.
   If the game draws with a scale (a devicePixelRatio-sized backing store), add `view: {w, h}` (its drawing units).
2. **Sprites**, where each is drawn now, inside the game's own camera transform and sort order:
   - a bitmap with a normal map: replace `ctx.drawImage(img, ...)` with `nl.drawSprite(img, normalMap, ...)` (same arguments). No map: `'derive'`.
   - drawn with canvas calls: wrap the existing call, `nl.shape(null, {x, y, w, h}, () => drawEnemy(e))`, box around that sprite in the current drawing coordinates. Things that always look the same (trees, rocks, crates, coins) get a string key instead of `null`, e.g. `'tree' + col + ',' + row`, so they are derived once.
   Never wrap ground, sky, backgrounds, the HUD or a whole-world draw; one sprite per box.
3. **Lights** (world units): at level start `nl.clear()`, then `nl.add({ id, x, y, radius, color, flicker })` for each lamp or torch; `follow: actor` for carried lights. Where a hit or spell is accepted, once: `nl.flash({ x, y, radius: 110, color: '#ffd28a', ms: 260 })`. A daylight game needs no lights: the key light and flashes.
4. **Render**: `nl.render()` as the last line of every draw path, including early returns.

**Keep every other caller working**: never read `nl.active` in game logic.

**Self-check without a browser**
- Modules byte-identical, loaded in order; one `GameDNA_Post` per canvas.
- `clock` is step-counted; `camera` matches the draw's offset.
- Every draw path ends with `nl.render()`, including the single draw after the `?t=` fast-forward.
- Walk one pixel at the defaults: key L.xy = (−0.66, −0.66). A flat pixel: unchanged. An edge facing up-left, n.xy = (−0.7, −0.7): e = 1.4 × 0.6 × 0.92 = 0.78, × 1.54, warmer. The edge facing down-right: × 0.46, cooler. Mean 1.0.

**Acceptance checks**
1. At 1x, wrapped sprites look rounded: warm and brighter toward the key (up-left) and lamps, cool and darker away, about as bright and saturated overall as before; ground, sky and HUD unchanged.
2. A hit flashes light on nearby sprites, fading quickly.
3. Sprites facing left are lit from the same side as those facing right.
4. `?webgl=0` looks and plays exactly as before; `?auto=1` ends as the original with WebGL on and off, no console errors.
