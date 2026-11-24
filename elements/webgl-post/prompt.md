# Add a WebGL post-processing stage (filmic grade, vignette, hit pulse) to my game

Defaults (change any of these before pasting):
`{{passes}}` = grade+pulse · `{{look}}` = filmic · `{{vignette}}` = 0.35 · `{{chroma}}` = 5 · `{{decay}}` = 260 · `{{sample}}` = auto

---

You are given `webgl-post.js`, a finished module, and its `README.md`. **Include the module verbatim** (`<script src>` before the game script, or pasted unchanged); never rewrite it. It defines `GameDNA_Post`. Read the README's API table first.

The game keeps drawing on its 2D canvas; the module lays a WebGL canvas over it (clicks pass through) and runs shader passes each frame: a filmic grade with vignette and a chromatic pulse on hits. Without WebGL, or with `?webgl=0`, it does nothing.

Add code only; never replace, rename or delete existing functions. Do not change the canvas size, its CSS, the context transform or smoothing.

**First, map my game**: the canvas; HUD panels; the fixed step and its frame counter; every draw path (title, play, pause, result, and the single draw after the `?t=` fast-forward); every place damage lands and whether its points are world or screen coordinates; the camera; where a level, battle or run starts.

**Integration points**

1. **Load** the module before the game script.
2. **Create one instance**, once, after the canvas exists:
```js
const post = GameDNA_Post.create({
  canvas: <the game canvas>,
  clock: () => <frame counter> * <step ms>,     // game time in ms, counted by the fixed step
  uiRects: () => [ <HUD rects, canvas px> ],         // grade and pulse leave these pixels untouched; see 5b
  params: { passes: '{{passes}}', look: '{{look}}', vignette: {{vignette}}, chroma: {{chroma}}, decay: {{decay}}, sample: '{{sample}}' }
});
```
3. **Render**: `post.render()` as the last line of EVERY draw path.
4. **Hit sites**: where each hit is accepted (once, on the step HP changes): `post.pulse(strength, { at: { x, y } })`, `strength` 0.4 chip damage, 0.7 normal hit, 1.2 killing blow or critical; `at` = the contact point in **canvas pixels** (subtract the camera from world coordinates).
5. **Clear** when a level, battle or run begins, not on death: `post.clear()`.
5b. **HUD rects: mask the plate, not the text.** One rect per HUD panel or window. Text drawn straight on the world (title, labels, `LIVES 3` over sky) stays unmasked; never a full-width strip with nothing behind it.

**Keep every other caller working**: `?auto=1` must reach exactly the same ending with WebGL on AND with `?webgl=0`; never make game logic depend on `post.active`. `?t=<ms>&freeze=1` must show the post-processed frame. Input, pause, restart and title behave as before. Keep the game's own shake, flash and hit-stop.

**Self-check without a browser**
- The module is byte-identical and loads before `create`.
- `clock` returns step-counted game time (no `Date.now()`, `performance.now()` or `Math.random()` in the integration).
- List every draw path and confirm each ends with `post.render()`.
- Every damage site calls `post.pulse` once, never inside a per-frame overlap loop; the point is in canvas pixels.
- Walk one hit: `pulse(0.7)` gives a 3.5 px colour split at the edges, a quarter of that 130 ms later, nothing after 260 ms.
- No host function removed or renamed.

**Acceptance checks** (screenshots if you can)
1. The game looks richer (deeper shadows, warm/cool tone, darker corners); pixel art as sharp; HUD panels unchanged, even during a pulse.
2. A hit briefly splits the colours outward from the contact point; a killing blow splits more.
3. `?auto=1` with WebGL on and with `?webgl=0`: no console errors, the original outcome; with `?webgl=0` it also looks exactly as before.
