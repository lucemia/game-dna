# Add bloom and glow to my game

Defaults:
`{{source}}` = emissive · `{{threshold}}` = 0.78 · `{{knee}}` = 0.5 · `{{intensity}}` = 1.6 · `{{radius}}` = 0.75 · `{{tint}}` = #fff1dc · `{{blend}}` = add · `{{emissiveGain}}` = 1.2

---

You are given `webgl-post.js` (global `GameDNA_Post`), `bloom-glow.js` (global `GameDNA_Bloom`) and their READMEs. **Include both verbatim**, `webgl-post.js` first, before the game script; never rewrite them. Read the bloom README first.

What the game draws into an **emissive layer** (a second canvas holding only what should glow) bleeds soft light; HUD rectangles are protected. Add code only; never replace, rename or delete existing functions, never change the canvas size, CSS, transform or smoothing.

**First, map my game**: the canvas and any draw scale; the fixed step and frame counter; every draw path (title, play, pause, result, and the draw after the `?t=` fast-forward); the camera; HUD and menu rectangles; what glows (projectiles, spells, fire, lanterns, crystals, sparks, sun or moon disc, flag tip, a selected button); big hits; where a level, battle or life starts. Reuse any existing `GameDNA_Post`.

**Integration points**

1. **Create**, once, after the canvas exists:
```js
const post = GameDNA_Post.create({ canvas: <game canvas>, clock: () => <frame counter> * <step ms>, params: { passes: 'none' } });
const bloom = GameDNA_Bloom.create({ post, clock: () => <frame counter> * <step ms>,
  params: { source: '{{source}}', threshold: {{threshold}}, knee: {{knee}}, intensity: {{intensity}}, radius: {{radius}}, tint: '{{tint}}', blend: '{{blend}}', emissiveGain: {{emissiveGain}} },
  uiRects: () => [ /* whole backing plates (panel, bar, window) drawn now, canvas px; r = corner radius */ ] });
```
   If the game draws with a scale, pass `view: {w, h}` and give rects in those units. Plate-less text (title, floating labels): leave it out of `uiRects` or draw it a backing box; never a full-canvas or full-width rect.
2. **Emissive**: at the end of every draw path, `const e = bloom.emissive();` (cleared each frame), then mark what glows on screen (minus camera). Pickups, units, heal/buff targets: only `bloom.glow(x, y, r, color, 0.3–0.5)`, a halo; never redraw the whole sprite (pale blob). Self-lit parts only (flame, projectile core, crystal, eye, spell particles): `e.drawImage`/`e.fillRect` of that part. A selected button: draw its rim into `e`, add its rect with `glow: true`.
3. **Render**: `bloom.render()` as the last line of every draw path.
4. **Big hits**: where a heavy hit, critical or kill is accepted (once): `bloom.flare(0.6 or 1.2 for a finisher, { at: { x, y } })` in on-screen units.
5. **Clear** when a level, battle or run begins: `bloom.clear()`.

**Choosing `source`**: keep `'emissive'` whenever the screen has large bright areas (sky, sand, snow, white text); daylight also `blend: 'screen'`, intensity 1.0–1.1, halos alpha 0.5–0.6. `'both'` only for dark scenes.

**Keep every other caller working**: never read `bloom.active` or the overlay for game logic.

**Self-check without a browser**
- Modules byte-identical, loaded in order; one `GameDNA_Post` per canvas.
- `clock` is step-counted (no `Date.now()`).
- Every draw path calls `bloom.emissive()` drawing (when something glows) and ends with `bloom.render()`.
- Emissive draws, `flare` points and `uiRects` use the same on-screen units as the game's own draw; `uiRects` covers the HUD, nothing in the world.
- Walk one value: threshold {{threshold}}, knee {{knee}}: brightness 0.9 passes 70 %, 0.6 passes 12 %, 0.39 nothing.

**Acceptance checks**
1. Glowing things have a soft halo and keep their detail (no flat white discs); HUD looks exactly as before.
2. A big hit briefly blooms brighter from its contact point.
3. `?webgl=0` looks and plays exactly as before; `?auto=1` ends as the original with WebGL on and off, no console errors.
