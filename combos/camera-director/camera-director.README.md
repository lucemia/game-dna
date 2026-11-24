# camera-director.js (K-01 module, v1.2)

One plain script, no dependencies, no `import`/`export`. It defines one global, `GameDNA_Camera`. Paste it into a `<script>` tag or load it with `<script src>`, without changing it. It replaces a hard-follow camera with a **directed** one: a critically damped spring with a dead zone, eased look-ahead, vertical re-framing only on landing (side view), multi-target framing (zoom out, or lean when the game cannot zoom), zoom punches, trauma shake (noise from game time, translation plus a small roll), level and room limits without jitter, and cuts for teleports.

**It is view only.** It never reads or writes game state. Your game keeps its own camera variable for everything that is not drawing (spawning or waking enemies "on screen", despawning, autoplay, saves, tests); the director is used only where the world is drawn and where the pointer is turned into world coordinates.

Optional look: load `skin-api.js` and a skin before it and pass `skin`. Only the debug overlay's accent colour and the pixel-snap default (pixel skins) come from it; the camera's motion never depends on the skin.

## API

`GameDNA_Camera.create(options)` returns an instance.

| option | meaning |
|---|---|
| `view` | Screen rect `{x, y, w, h}` the world is drawn into, in the game's logical canvas px (the size the game draws at before any backing-store scale). Leave the HUD outside it if the HUD has its own strip. Default: the first canvas. |
| `bounds` | World rect `{x, y, w, h}` the view must stay inside (the level). A level smaller than the view is centred. Change it with `setBounds` when a level loads. |
| `rooms` | Optional `[{x, y, w, h}]`: while the target is inside one, the camera keeps inside it too; moving between rooms glides. Or pass `room` to `update`, or `setRoom(rect | null)`. |
| `uiRects` | Optional array or function → screen rects of HUD panels and labels. The safe frame shrinks away from them, so the target is never framed under the HUD; wide bands (≥ ¼ of the view, e.g. a boss bar) also shrink the framing box, so `extra` targets are composed clear of them. |
| `seed` | Integer for the shake noise. Same seed + same calls = the same frames. Default 1. |
| `zoom` | `false` if the game cannot scale its world drawing (it subtracts the camera from every draw and you will not use `apply` / `applyScreen`). Multi-target framing then leans instead of zooming. |
| `pixel` | `true` / `false` to force or forbid whole-pixel output (else `params.snap`). |
| `skin` | Skin id or object (needs `GameDNA_Skin`). Omit for the built-in look. |
| `params` | See the table below. |

| param | default | |
|---|---|---|
| `view` | `'side'` | `'side'` (platformer: horizontal look-ahead from facing, platform snapping) or `'top'` (top-down: 2D look-ahead from velocity, dead zone on both axes) |
| `follow`, `followY` | 1.8, 1.4 | Spring frequency in Hz, horizontal / vertical (critically damped: no overshoot, no wobble) |
| `deadW`, `deadH` | 0.08, 0.12 | Dead zone, fraction of the view |
| `look`, `lookHz`, `idleLook` | 0.15, 0.7, 0.4 | Look-ahead distance (fraction of view width), its own spring (low = eased turn-around), share kept while standing. The lead also covers the dead zone and the follow spring's lag, so at full speed the camera really is ~`look` ahead; it swings at most 0.9× the target's speed |
| `platform` | `'auto'` | Side view: re-frame vertically only on landing, or when the target leaves the `farY` band (0.28 of the view height up, 70 % of that down). `auto` = on when you pass `onGround`. A long fast drop (falling faster than ~0.8 view heights/s below the band) leads the camera downward by its lag plus ~0.15 s of the fall, so the landing is on screen ~0.2 s before touchdown; ordinary hops never trigger it |
| `biasY` | 0.06 | The camera sits this fraction of the view height above the target |
| `safe` | 0.8 | The target never leaves this central fraction of the view (the springs are overruled), except at the level edge |
| `frame`, `minZoom`, `pad` | `'zoom'`, 0.72, 0.1 | Multi-target framing: zoom out to fit `extra` targets, down to `minZoom`; `'bias'` = lean toward them without zoom; `'off'`. An extra counts fully within 0.75 of a view of the target and fades out by 1.25 views |
| `minSize` | 0.1 | Framing never zooms out so far that the target (its `h`) is drawn smaller than this fraction of the view height; then it leans instead |
| `blend` | 0.9 | Framing and room changes are an offset blended by their own spring (Hz) with a speed cap (≥ 0.2 view/s, 1.1× the target's speed): a boss appearing or dying, a room opening, never steps the camera. Zoom changes ≤ 30 % per second |
| `punch` | 0.06 | Zoom punch of a finisher (a heavy hit gets 60 %); off on pixel output and reduced motion |
| `shake`, `roll`, `decay`, `freq` | 3, 1.2, 1.6, 14 | Trauma shake: max offset in % of the view height, max roll in degrees, trauma lost per second, noise Hz. Offset = shake × trauma² × noise |
| `snap` | `'auto'` | `'pixel'`: whole-pixel camera, zoom 1, no roll, no punch; `'smooth'`: sub-pixel. `auto` = pixel when the view is 270 px tall or less, or the skin is pixel |
| `reduced` | `'system'` | Reduced motion: shake × 0.3, no roll, no punch. `system` reads `prefers-reduced-motion` once |
| `mode` | `'director'` | `'off'` passes the game's own camera (`legacy`) through unchanged: for A/B comparisons and an options-menu switch |

| method / field | |
|---|---|
| `update(dtMs, {target, extra, legacy, room, bounds})` | **Once per fixed step**, after the world moved (also on frozen hit-stop steps: it is view only). `target = {x, y, vx, vy, onGround, facing, w, h}` in world px: the point to frame (sprite centre), its velocity (any unit; only direction and ratio to the fastest seen are used), `onGround` (side view; omit for flyers or top-down), `facing` `1` / `-1`. `extra` = `[{x, y, w, h, weight}]` things to keep in frame with the target (a boss, a second player); `weight` 0..1 (0.5 = lean half way). Pass a boss for as long as it is alive in the area, **before** it is on screen (not only once the game marks it seen): it fades in by distance, so the framing has already moved by the time it appears, and it does not slide in under a boss bar. `legacy = {x, y}` = your game's own camera top-left this step (used by `mode: 'off'` and by tests). No target (title screen): the camera holds. |
| `cam.x`, `cam.y` | Top-left of the view in world px, as at zoom 1 (shake included; whole pixels when snapping). For games that draw with `worldX - camX`. |
| `cam.cx`, `cam.cy`, `cam.zoom`, `cam.angle` | Centre, zoom (punch included) and roll (radians) this frame. |
| `apply(ctx)` / `restore(ctx)` | Wrap the world drawing: `apply` saves and sets translate + roll + zoom so you draw in WORLD coordinates; `restore` pops it. Draw the HUD after `restore`. Same transform on every call until the next `update` (safe on redraws). |
| `applyScreen(ctx)` / `restore(ctx)` | For games that keep subtracting `cam.x` / `cam.y`: adds only roll and zoom about the view centre. |
| `visible(pad)`, `inView(x, y, w, h, pad)` | The world rect the view can show this frame (zoom and roll included): cull tiles and sprites for DRAWING with it. |
| `toScreen(wx, wy)`, `toWorld(sx, sy)` | World ↔ screen through this camera (pointer picking, screen-space effects at a world point). |
| `hit(strength, {at})` or `hit({strength, at, crit})` | A big blow: `'light'` trauma 0.22; `'heavy'` 0.42 + 60 % punch; `'finisher'` 0.78 + full punch, zooming toward `at`. Same options object as `GameDNA_HitStop.hit`. |
| `trauma(a)` | Add trauma 0..1 (capped at 1): explosions, slams, hard landings. |
| `punch(a, {at, ms})` | A zoom punch of `a` (0.06 = 6 %) toward `at`, back over `ms` (280). |
| `shake(px, ms)` | Compatibility with `onShake(px, ms)` callbacks of other elements: converted to trauma, never stacks above 1. |
| `cut(x, y)` | Jump there now, no glide (teleport, respawn, door, level start). A target that moves more than 0.6 of a view in one step is cut automatically. |
| `clear()` | Forget everything (new level / run); the next `update` cuts to the target. |
| `setBounds(r)`, `setRoom(r)`, `setView(r)`, `setParams(o)`, `params()`, `stats()`, `state()`, `debug(ctx)` | Live changes; counters; a snapshot; the debug overlay (safe frame, dead zone, look-ahead, framing box, ground line, edges, trauma) drawn in screen px after `restore`. |

## Integration (15 lines)

```js
// <script src="camera-director.js"></script> before your game script
const cam = GameDNA_Camera.create({ view: { x: 0, y: 0, w: VIEW_W, h: VIEW_H }, bounds: { x: 0, y: 0, w: LEVEL_W, h: LEVEL_H },
  params: { view: 'side', follow: 1.8, look: 0.15, shake: 3, roll: 1.2 }, seed: 1 });
function fixedStep() {
  /* ...existing input, world, and the game's OWN camera update (keep it: gameplay reads it)... */
  cam.update(STEP_MS, { target: { x: hero.x + hero.w / 2, y: hero.y + hero.h / 2, vx: hero.vx, vy: hero.vy, onGround: hero.onGround, facing: hero.facing },
    extra: boss && boss.alive ? [{ x: boss.cx, y: boss.cy, w: boss.w, h: boss.h }] : [], legacy: { x: camera.x, y: camera.y } });
}
function onHit(target, info) { /* ...existing... */ cam.hit({ strength: info.kill ? 'finisher' : info.heavy ? 'heavy' : 'light', at: info.point }); }
function onTeleport(x, y) { /* ...existing... */ cam.cut(x, y); }
function render() {
  drawBackground(cam.cx, cam.cy, cam.zoom);                          // parallax reads the DRAW camera
  cam.apply(ctx); drawWorld(cam.visible(32)); cam.restore(ctx);      // world in world coords, culled by visible()
  drawHud();                                                         // HUD never moves
}
```

A game that draws with `x - camX` everywhere: keep that, but read `cam.x` / `cam.y` there instead of the old variable (whole pixels on a pixel game), and wrap it in `cam.applyScreen(ctx)` … `cam.restore(ctx)` if you want zoom and roll (or create with `zoom: false`).

## Keep the rest of the game working

- **Find every reader of the old camera** (search for its name) and sort them: DRAWING readers (tile and sprite positions, culling for drawing, parallax, screen-space effects at world points, pointer → world) switch to the director; GAMEPLAY readers (spawn or wake "on screen", despawn off screen, AI that checks visibility, autoplay, saved state, debug or test hooks) keep reading the game's own camera, which you keep computing exactly as before. Never assign the director's values to the old variable.
- Call `update` in the fixed step that `?t=` fast-forward and `?auto=1` also run (never in render, never on wall-clock time). Then `?t=<ms>&freeze=1` shows the same frame every time and autoplay ends exactly as before.
- Call `cut` (or `clear`) wherever the game teleports or restarts: respawn, checkpoint, door, new level, title → play. Call `setBounds` when a level of another size loads.
- HUD, menus and text boxes are drawn after `restore`, at fixed screen positions. Screen-space effects that sit on a world point use `toScreen`.
- Culling with the old camera hides things at the edges when the director zooms out or leads: cull drawing with `visible(pad)`.
- Hook, don't replace: keep every function, name and caller, including the old camera function.

## Self-check without a browser

- The module file is byte-identical and loads before `create`.
- `cam.update(...)` runs once per fixed step, on every scene that shows the world, after the target moved; `target` is in WORLD px (not screen), `legacy` is the game's own camera.
- Every reader of the old camera is listed and marked draw (switched) or gameplay (unchanged); no line assigns `cam.x` / `cam.y` back into game state.
- `apply` / `applyScreen` and `restore` are paired on every path of the world draw; the HUD is drawn after `restore`.
- Walk one turn-around at full speed: the view drifts on for ~0.25 s, crosses the hero at ~1.5 s, settles ~`look` ahead on the other side by ~2.5 s, never faster than ~2× the hero.
- Walk one landing: the hero jumps from ground y 760 to a ledge at 650 → while airborne `cam.cy` stays where it was; after landing it glides about 110 px up over ~0.6 s, with no overshoot.
- Walk one finisher: `cam.hit('finisher', {at})` → trauma 0.78 → shake up to 3 % × 0.61 of the view height (≈ 6.6 px at 360), roll ≤ 0.73°, zoom +6 % for ~0.3 s, all gone after ~0.5 s.
- `cut` runs at every teleport / respawn / level start; nothing else was removed or renamed.

## What it guarantees

- Deterministic: state advances only in `update(dt)`; the shake is smooth value noise of accumulated game time and the seed. No `Math.random`, no wall clock.
- `apply` / `applyScreen` are idempotent between updates: draw as many times per step as you like (redraws, pause and menu screens, 120 Hz displays) and every draw gets the same transform; no need to cache or rebuild it yourself. A camera whose `update` never runs simply stays put (`stats().selfTicks` counts those applies).
- The base camera (without shake) never leaves `bounds`; at an edge the spring stops with zero speed (no bounce). Shake may overhang an edge by its own amplitude. Rooms only limit the goal through the blended offset, so entering and leaving them glides, and a room yields once the target walks toward its wall (it can't pin the hero at the screen edge). Release a room when the game opens it (`room: null` / `setRoom(null)`).
- Pans caused by framing, rooms and look-ahead stay within about 2× the target's speed (measured: turn-around 1.9×, boss appearing 1.8×); the base pan is capped at 2× the target's current speed (floor 5 % of the view per second), so when the target stops the camera stops with it instead of sliding on, and a released room or framing drifts back slowly while it stands. Following a fast fall may overtake the fall by at most 1.4×. `stats().maxPan` reports the peak base pan speed (px/s).
- The target stays inside the `safe` frame except where the level edge prevents it.
- Critically damped springs: one approach, at most one small overshoot after a sudden reversal; the dead zone moves continuously, so the camera never chatters.
- Pixel output: whole-pixel `x`, `y`, zoom 1, no roll. Smooth output: sub-pixel.
- Never throws from `update`, `apply`, `restore` or `debug`; bad input is counted in `stats().badInput` and ignored. No input listeners.

## With hit-stop, shake & flash (E-05) and other shakers

E-05 shakes the field by whole pixels inside its `begin` / `end`. With this camera in the game, let the camera own the shake: create E-05 with `params.shake: 0` (its freeze and flashes stay) and call `cam.hit({strength, at})` beside `juice.hit(...)` at every hit site. Elements that request a shake through a callback (`onShake: (px, ms) => ...`) route it to `cam.shake(px, ms)`. Keep E-05's `step` gate first in the step and call `cam.update` on every step, frozen or not (the frozen frame trembles; nothing follows because nothing moves). A game that keeps E-05's own shake instead: set this camera's `shake: 0` and `roll: 0`, so the two never add up.
