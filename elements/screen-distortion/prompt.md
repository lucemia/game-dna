# Add screen-space distortion to my game

Defaults:
`{{strength}}` = 1 · `{{heat}}` = 2.2 · `{{water}}` = 2.2 · `{{portal}}` = 1 · `{{wave}}` = 9 · `{{waveRadius}}` = 150 · `{{chroma}}` = 0.35 · `{{shine}}` = 0.35

---

You are given `webgl-post.js` (global `GameDNA_Post`), `screen-distortion.js` (global `GameDNA_Distort`) and their READMEs. **Include both verbatim**, `webgl-post.js` first, before the game script; never rewrite them.

The frame bends like hot air, water and lenses; HUD pixels never move. Add code only; never replace, rename or delete existing functions; never change the canvas size, CSS, transform or smoothing.

**First, map my game**: the canvas and any draw scale; the fixed step and frame counter; every draw path (title, play, pause, result, and the draw after the `?t=` fast-forward); the camera; HUD and window rectangles; what is hot (fire, torches, lava), wet (water, rivers) or a gate (portal, magic door); where explosions, slams, heavy hits and kills are accepted; where a level starts. Reuse any existing `GameDNA_Post`.

**Integration points**

1. **Create**, once, after the canvas exists:
```js
const fx = GameDNA_Distort.create({ canvas: <game canvas>, clock: () => <frame counter> * <step ms>,
  params: { strength: {{strength}}, heat: {{heat}}, water: {{water}}, portal: {{portal}}, wave: {{wave}}, waveRadius: {{waveRadius}}, chroma: {{chroma}}, shine: {{shine}} },
  regions: () => [ /* on-screen now, camera subtracted: {kind:'heat'|'water', x, y, w, h} or {kind:'portal', x, y, r} */ ],
  uiRects: () => [ /* every HUD element and open window drawn now: tight rects, panel or not */ ] });
```
   If the game draws with a scale (a devicePixelRatio-sized backing store), pass `view: {w, h}` and give everything in those units.
2. **Regions** (read every frame; only read state): heat rect from the source (include it) upward over detailed scenery, 1.5–3× its width; water rect over the water as drawn; portal circle a bit smaller than its ring. Only things drawn now; `[]` elsewhere.
3. **Shockwaves**: once where an explosion, slam, heavy hit or kill is accepted, never per frame: `fx.shockwave(x, y, { strength })` at the on-screen contact point; 0.5 light hit, 0.8 heavy, 1–1.4 kill, explosion or boss stomp. A game with no hot, wet or gate things uses shockwaves only; never invent regions over empty ground.
4. **Render**: `fx.render()` as the last line of every draw path.
5. **Clear**: `fx.clear()` where a level, battle or run begins.

**HUD**: rects around plate-less text leave no visible box, so include every HUD element: text, hearts, bars, panels, open windows.

**Keep every other caller working**: never read `fx.active` or the overlay for game logic.

**Self-check without a browser**
- Modules byte-identical, loaded in order; one `GameDNA_Post` per canvas.
- `clock` is step-counted (no `Date.now()`).
- Every draw path ends with `fx.render()`, including the single draw after the `?t=` fast-forward.
- `regions`, `shockwave` points and `uiRects` use the same on-screen units and camera offset as the game's draw.
- Walk one wave at a 360 px tall view: `shockwave(x, y, {strength: 1})` reaches {{waveRadius}} px over 650 ms; at 325 ms its radius is 87.5 % of that and its swell {{wave}} × 0.25 px. A 180 px tall game: half the distances.

**Acceptance checks**
1. Hot, wet and gate things shimmer, wobble or swirl and follow the camera; nothing else bends.
2. Each explosion, slam or kill sends one ring outward from its contact point that fades within a second.
3. HUD text and windows never bend, even when a ring crosses them.
4. `?webgl=0` looks and plays exactly as before; `?auto=1` ends as the original with WebGL on and off, no console errors.
