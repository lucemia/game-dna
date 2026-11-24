# Add a multi-layer parallax backdrop to my game

Defaults (change any of these before pasting):
`{{theme}}` = forest · `{{time}}` = day · `{{layers}}` = 5 · `{{depth}}` = 1 · `{{vertical}}` = 0 · `{{ambient}}` = 1 · `{{drift}}` = 1 · `{{sway}}` = 0 · `{{floor}}` = none

---

You are given `parallax-layers.js`, a finished module, and its `README.md`. **Include the module verbatim** (`<script src>` before the game script, or pasted unchanged into its own `<script>`). Never rewrite it. It defines `GameDNA_Parallax`. Read the README's API table first.

It replaces my flat background with 3–6 generated layers that scroll at different speeds behind tiles and sprites. Only wire it in: add code, never delete or rename existing functions.

**First, map my game**: native resolution and the play-field rect (above the HUD); the fixed update step and how `?t=`, `?freeze=1`, `?auto=1` drive it; the draw order and the ONE call that paints the old background; the camera (the number tiles subtract: `worldX - camX`) or none; the y where the ground starts (top of the ground tiles, or where units stand); every screen that draws the old background (title, play, results).

**Integration points**

1. **Load** the module before the game script.
2. **Create one instance** once, after the canvas size exists, then `prebuild()`:
```js
const bg = GameDNA_Parallax.create({
  view: { x: 0, y: 0, w: FIELD_W, h: FIELD_H },          // what the old background covered
  seed: 1, theme: '{{theme}}', time: '{{time}}',
  params: { layers: {{layers}}, depth: {{depth}}, vertical: {{vertical}}, ambient: {{ambient}}, drift: {{drift}}, sway: {{sway}}, floor: '{{floor}}', ground: GROUND_Y / FIELD_H },
  getObstacles: () => /* sprite rects in screen px, or [] */
});
bg.prebuild();
```
   Pick the theme closest to my setting (forest, cliffs = coast, cave, city); `time` from my palette (warm sunset → dusk).
3. **Advance** in the fixed step (the same one `?t=` fast-forward runs): `bg.update(stepMs)`. Never real time.
4. **Draw** where the old background was drawn, as the first draw of the frame, outside any shake translate: `bg.draw(ctx, camX, camY)` (camera position, not negated; `0, 0` without a camera). Stop drawing the old background there but keep its code.
5. **Static screens** (side-view battle, menus): `bg.draw(ctx, 0, 0)`; use `sway` 1–3 for life. If the old background painted the ground the units stand on, keep that ground: give the module only the area above it (`view.h` = that horizon y, `ground: 1`) and draw the old image's ground band after `bg.draw` (`ctx.drawImage(old, 0, H0, w, h, 0, H0, w, h)`); or replace it with `floor: 'plain'`.

**Keep every other caller working**: `?auto=1` reaches the same ending; `?t=<ms>&freeze=1` shows the same frame every time; title, pause, restart and result screens still show a background; shortcuts unchanged; HUD drawn last. The module reads no input.

**Self-check without a browser**
- The module is byte-identical to the one given and loads before `create`; `create` runs once.
- `bg.update` sits in the fixed step, not in the render loop.
- `bg.draw` gets the same camera numbers the tiles use; walk one frame: camera 200 → far layer moves 32 px (×0.16), mid 96 px (×0.48).
- `ground` worked example: 320×180, ground tiles at y 148 → `148 / 180 = 0.82`.
- Identifiers inside `getObstacles` exist when first called.
- No host function removed or renamed; the old background code is still there.

**Acceptance checks** (screenshots if you can)
1. Behind the tiles: sky with dithered bands, far range, trees / cliffs / buildings, dark near foliage; no flat single colour left.
2. Moving the camera, near layers move faster than far ones; no gaps or seams; no shimmer when standing still.
3. Two `?t=…&freeze=1` shots 1 s apart: clouds, stars, grass or lights have moved slightly, nothing else.
4. Sprites, tiles and HUD all drawn on top; pits show the backdrop.
5. `?auto=1` to the end: no console errors, same outcome.
