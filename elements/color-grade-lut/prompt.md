# Add colour grading with blending LUTs, vignette and film grain to my game

Defaults (change any of these before pasting; flat, saturated pixel art: strength 0.6–0.75):
`{{preset}}` = neutral · `{{strength}}` = 1 · `{{blend}}` = 900 · `{{vignette}}` = 0.3 · `{{grain}}` = 0.035 · `{{builtin}}` = replace

---

You are given two finished modules with their READMEs: `webgl-post.js` (I-08, global `GameDNA_Post`) and `color-grade-lut.js` (global `GameDNA_ColorGrade`). **Include both verbatim**, `webgl-post.js` first, before the game script; never rewrite them. Read `color-grade-lut.README.md` first.

The game draws on its 2D canvas as now; the module grades each frame through a 3D colour lookup table on a WebGL layer, blends looks over game time, and adds vignette and grain. Presets: `neutral`, `dusk`, `night`, `memory`, `combat`, `toxic`. Without WebGL, or with `?webgl=0`, it does nothing.

Add code only; never rename or delete functions. Do not change the canvas size, its CSS, the context transform or smoothing.

**First, map my game**: the canvas; the fixed step and frame counter; every draw path (title, play, pause, result, the single draw after the `?t=` fast-forward); the zones, phases and scenes; the HUD and every window or menu with its canvas-pixel rect; where a game or level starts; whether the game already calls `GameDNA_Post.create`.

**Integration points**

1. **Load** both modules before the game script.
2. **Create once**, after the canvas exists (and after the game's own `GameDNA_Post.create`, if any: the module shares it):
```js
const grade = GameDNA_ColorGrade.create({
  canvas: <the game canvas>,
  clock: () => <frame counter> * <step ms>,
  params: { preset: '{{preset}}', strength: {{strength}}, blend: {{blend}}, vignette: {{vignette}}, grain: {{grain}}, builtin: '{{builtin}}' },
  uiRects: () => <HUD and open-window rects now, canvas px>
});
```
3. **Choose a look per screen, zone or phase** (never per turn or attacker): in the fixed step call `grade.to(<name>, <ms>)` from state, e.g. battle `combat`, enemy phase `night`, swamp `toxic`, flashback `memory`, evening `dusk`, otherwise `{{preset}}`. Idempotent: calling it every step is fine. 600–1500 ms, 0 to cut.
4. **Cut on (re)start**: where a new game or level starts, `grade.set(<its look>)`.
5. **Render**: `grade.render()` as the last line of EVERY draw path.

**HUD stays clean**: list every HUD bar, window, menu and banner plate in `uiRects` (canvas px, including any HUD draw offset). No sprites. Text drawn straight on the world (title text, field labels) has no plate: leave it unmasked, or a rect shows an ungraded box.

**Keep every other caller working**: `?auto=1` must reach exactly the same ending with WebGL on and with `?webgl=0`; game logic never reads `grade` or `post`. `?t=<ms>&freeze=1` must show the graded frame. Input, restart and title behave as before.

**Self-check without a browser**
- Both modules byte-identical, loaded in order; exactly one `GameDNA_Post.create` for the canvas (yours or none).
- `clock` and every `to()` use step-counted time; no `Date.now()`, `performance.now()` or `Math.random()` in the integration.
- List every draw path; each ends with `grade.render()`.
- Every name passed to `to`/`set` is a preset.
- Walk one blend: `to('night', 1200)` → mix 0, 0.5 at 600 ms, 1 at 1200 ms; lantern orange stays orange, mid-grey turns slate blue.
- For each screen, `uiRects` returns rects matching what is drawn.

**Acceptance checks** (screenshots if you can)
1. Each place or phase has a distinct mood; switching blends smoothly.
2. The HUD text and bars look exactly as without the module.
3. Soft dark corners and fine grain, no double vignette.
4. `?webgl=0`: looks and plays exactly as before, no console errors.
5. `?auto=1` to the end with WebGL on and off: no console errors, same outcome as the original game.
