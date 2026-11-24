# Add weather and ambient particles to my game

Defaults (change any of these before pasting):
`{{weather}}` = rain · `{{density}}` = 1 · `{{intensity}}` = 0.5 · `{{wind}}` = 0.4 · `{{gust}}` = 0.35 · `{{front}}` = 0.25 · `{{night}}` = 0 · `{{shade}}` = 0 · `{{cap}}` = 180

---

You are given `weather-particles.js`, a finished module, and its `README.md`. **Include the module verbatim** (`<script src>` before the game script, or pasted unchanged into its own `<script>`). Never rewrite it. It defines `GameDNA_Weather`. Read the README's API table first.

It draws seeded weather in depth layers behind and in front of my sprites. Only wire it in: add code, never delete or rename existing functions.

**First, map my game**: native resolution and play-field rect; the fixed update step and how `?t=`, `?freeze=1`, `?auto=1` drive it; the draw order; the camera (the number tiles subtract) or none; side view or top-down; for a side view, how to find the ground top under a screen x, and the pits; every HUD bar and window drawn over the field.

**Integration points**

1. **Load** the module before the game script.
2. **Create one instance** once, after the canvas size exists:
```js
const wx = GameDNA_Weather.create({
  view: { x: 0, y: FIELD_Y, w: FIELD_W, h: FIELD_H },
  seed: 1, weather: '{{weather}}',
  params: { density: {{density}}, intensity: {{intensity}}, wind: {{wind}}, gust: {{gust}}, front: {{front}}, night: {{night}}, shade: {{shade}}, cap: {{cap}} },
  ground: sx => /* side view: screen y of the ground top under screen x, null over a pit; DELETE this line for top-down */,
  uiRects: () => [ /* every HUD bar and open window, screen px */ ]
});
```
3. **Advance** in the fixed step (the one `?t=` fast-forward runs): `wx.update(stepMs)`. Never real time; skip it while paused.
4. **Draw behind**: right after the background, before tiles and sprites: `wx.drawBack(ctx, camX, camY)`.
5. **Draw in front**: after the last sprite or effect, before the HUD and windows: `wx.drawFront(ctx, camX, camY)`. One slot only (e.g. a top-down map drawn inside a translate): call `wx.draw(ctx, camX, camY)` once after it, outside the translate, `view` in screen px.
6. **Changes** (optional): where the story or area changes, `wx.setWeather('snow', 2000)`. Never re-create the instance.

Pass the tiles' camera (`camX`, not `-camX`; `0, 0` without one), outside any shake translate.

**Keep every other caller working**: `?auto=1` reaches the same ending; `?t=<ms>&freeze=1` gives the same frame every time; title, pause, restart and result screens still work (weather there only if it fits, their windows in `uiRects`); HUD drawn last. The module reads no input.

**Self-check without a browser**
- The module is byte-identical to the one given and loads before `create`; `create` runs once.
- `wx.update` sits in the fixed step, not in the render loop.
- `drawBack` is after the background and before the first tile or sprite; `drawFront` is after the last sprite and before the first HUD call.
- `ground` takes and returns **screen** px. Worked example: camera 200, ground column 20 (world x 320–335) tops out at y 148 → `ground(125)` = 148; over a pit → `null`.
- Every window that can open over the field is in `uiRects` while shown; identifiers there and in `ground` exist when first called.
- No host function removed or renamed.

**Acceptance checks** (screenshots if you can)
1. Rain falls in two or more depths (far streaks behind, near ones over the hero), slanting with the wind; splashes sit on the ground surface, none over pits.
2. No particle touches the HUD or an open window.
3. Two `?t=…&freeze=1` loads at the same t are identical.
4. `?auto=1` to the end: no console errors, same outcome as before.
