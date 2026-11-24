# Add a camera director to my game

Defaults (change any of these before pasting):
`{{view}}` = side (top for a top-down game) · `{{follow}}` = 1.8 · `{{look}}` = 0.15 · `{{deadW}}` = 0.08 · `{{safe}}` = 0.8 · `{{frame}}` = zoom · `{{minZoom}}` = 0.72 · `{{punch}}` = 0.06 · `{{shake}}` = 3 · `{{roll}}` = 1.2 · `{{snap}}` = auto · `{{reduced}}` = system

---

You are given `camera-director.js` and its `README.md` (read its API table first). **Include the module verbatim** (`<script src>` before the game script, or pasted unchanged into its own `<script>`); never rewrite it.

It replaces my hard-follow camera. **View only: rules, timing and outcomes must not change.** Add code only; never replace, rename or delete functions.

**First, map my game**: the fixed step and its callers (rAF loop, `?t=`, `?auto=1`); the hero's world position, velocity, on-ground flag, facing; bosses, arenas; level size; teleports, respawns; and **every reader of the current camera variable** (search its name), each marked DRAW (sprite and tile positions, draw culling, parallax, pointer → world) or GAMEPLAY (spawn or wake "on screen", despawn, AI, autoplay, test hooks, saves).

**Integration points**

1. **Load** the module before the game script.
2. **Create one instance** when the level size is known:
```js
const cam = GameDNA_Camera.create({ view: { x: 0, y: 0, w: VIEW_W, h: VIEW_H }, bounds: { x: 0, y: 0, w: LEVEL_W, h: LEVEL_H }, seed: 1, uiRects: () => HUD_RECTS,
  params: { view: '{{view}}', follow: {{follow}}, look: {{look}}, deadW: {{deadW}}, safe: {{safe}}, frame: '{{frame}}', minZoom: {{minZoom}},
    punch: {{punch}}, shake: {{shake}}, roll: {{roll}}, snap: '{{snap}}', reduced: '{{reduced}}' } });
```
   `view` = screen rect of the world, logical px; `HUD_RECTS` = HUD panels and labels. Subtract-style drawing you won't wrap: add `zoom: false`.
3. **Every fixed step**, after movement and the old camera: `cam.update(STEP_MS, { target: {x, y, w, h, vx, vy, onGround, facing}, extra, legacy: {x: oldCamX, y: oldCamY}, room })`; target = hero sprite centre and size, world px; `extra` = `[{x, y, w, h}]` for a living boss, even off screen, else `[]`. `room` = arena rect while it is shut, else `null`. The old camera keeps running unchanged for GAMEPLAY readers; never write `cam` values into it.
4. **Draw**: switch every DRAW reader. Translate-style: `cam.apply(ctx)` … `cam.restore(ctx)`, draw in world coordinates; subtract-style: use `cam.x` / `cam.y` (wrap in `cam.applyScreen(ctx)` … `cam.restore(ctx)` for zoom and roll). Cull with `cam.visible(pad)`; parallax reads `cam.cx`, `cam.cy`; HUD after `restore`.
5. **Events**: hits → `cam.hit({strength: 'light' | 'heavy' | 'finisher', at: {x, y}})`; slams → `cam.trauma(0.3-0.6)`; teleports, respawns, level starts → `cam.cut(x, y)`.

**Keep every other caller working**: `?auto=1` reaches the same ending at the same time; `?t=<ms>&freeze=1` is identical every run (`update` in the step, never in render); shortcuts, pause, restart work. An existing screen shake: route it to `cam.shake(px, ms)` or set it to 0.

**Self-check without a browser**
- Module byte-identical, loaded before `create`.
- `cam.update` runs once per fixed step with WORLD coordinates.
- Every old-camera reader is listed as DRAW (switched) or GAMEPLAY (unchanged); no game state is assigned from `cam`.
- `apply`/`restore` paired on every path; HUD outside.
- Walk one landing (defaults): airborne, `cam.cy` holds; after landing it glides up in ~0.6 s, no overshoot.
- Nothing removed, renamed.

**Acceptance checks**
1. Running: room ahead; turning eases the view across.
2. Jumping: no bob; the view rises only after landing higher.
3. Boss: both in view, faded in without a whip-pan; a finisher punches in, shakes, settles.
4. Edges: clean stop.
5. `?auto=1` to the end: no console errors, same outcome and time.
