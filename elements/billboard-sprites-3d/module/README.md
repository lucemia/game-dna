# GameDNA_Billboards3D (N-02 billboard sprites in 3D, module v1.0.3)

`billboard-sprites-3d.js` is one plain script (no imports, ASCII only) that defines one global, `GameDNA_Billboards3D`.
It stands painted 2D characters in a three.js scene as camera-facing billboards: painted sprites in a 3D diorama.
It owns everything about the sprite in 3D: the quad, its yaw toward the camera, feet on the ground, which side the
character looks at (read on screen, from the camera), painted left / right variants, walk frames by distance, a hop
for single-picture characters, procedural attack / hurt / down motion for single pictures, the hit flash (in the
material), a soft blob shadow, screen anchors for 2D overlays and a text state. Paste it verbatim or load it with
`<script src>` after `three.min.js` (tested with three.js 0.149.0); do not rewrite it.

## Facing rule (one place)

Every frame the module projects the actor and its target (or the point it is walking toward) to the screen and picks
`want = 'left' | 'right'` from that screen direction, so it is right for ANY camera yaw. Then
`flipX = (want !== source.facing)`; a source with a painted variant for `want` uses it (no mirror); a source marked
`mirror: 'never'` is never mirrored (it stays on its native side and `state()` reports a problem). Target first, then
the move direction; a move straight toward or away from the camera keeps the last side. While a one-shot plays (`hurt`, `attack`, `guard`, `cast`, `down`) movement never turns the actor: a knockback
slide or a lunge keeps the side (v1.0.1); a target still wins.

## API

| call | notes |
|---|---|
| `GameDNA_Billboards3D.create(o)` | `o = {scene, camera, renderer, THREE?, groundY(x, z)?, ground?: mesh \| [meshes], filter: 'smooth' \| 'crisp', mode: 'camera' \| 'cylinder', shadow: 'blob' \| 'sprite' \| 'both' \| 'none', shadowAlpha 0.55, push 0.15, alphaMode: 'blend' \| 'cutout', flashMs 200, hop 0.06, tint '#ffffff', lightProbe 0..1, view?: {w, h}}`. `groundY` (or a raycast on `ground`) gives the floor height under an actor; default 0. Returns a no-op stub (and warns once) when three.js, scene or camera is missing. |
| `bb.add(spec)` | `spec = {id, source, x, z, h, hover, gait: 'auto' \| 'frames' \| 'hop' \| 'hover' \| 'still', target, tint, shadowScale, castShadow}`. `h` = world height of the body (feet to top of head). Call once per character. |
| `bb.move(id, x, z)` | World position of the FEET each step (the module takes y from `groundY`). The move direction and walked distance come from the change. A jump of more than 4 h is a teleport (no walk, no turn). |
| `bb.setTarget(id, otherId \| {x, z} \| null)` | Who the actor looks at (fights, talks to). Wins over the move direction. |
| `bb.setMove(id, dx, dz)` / `setMove(id, null)` | Optional facing hint when your game turns a unit without moving it. |
| `bb.play(id, 'attack' \| 'slash' \| 'cast' \| 'hurt' \| 'guard' \| 'down' \| 'cheer' \| 'idle', {ms})` | One-shot; `hurt` also flashes; `down` stays down until `play(id, 'idle')`. |
| `bb.flash(id, ms?, color?)` | Hit flash in the material (over-exposes toward the colour, keeps line work and alpha). Never a rectangle. |
| `bb.set(id, {alpha, visible, h, hover, gait, tint, shift, lift, squash, tilt})` | Host-driven extras (fade on defeat, size). |
| `bb.update(dtMs)` | Once per frame AFTER the camera moved and BEFORE `renderer.render`. `update(0)` re-orients only (paused, `?t=` stills). |
| `bb.anchor(id, 'head' \| 'feet' \| 'center')` | Screen point in CSS px of the canvas: `{x, y, top, w, h, visible}` (no arg: all fields). For speech bubbles, damage numbers, HP bars. |
| `bb.anchors()`, `bb.ids()`, `bb.get(id)` | `get(id).mesh` is the three.js mesh (layers, renderOrder). |
| `bb.state()` | `{t, actors: [{id, x, y (screen feet), wx, wy, wz, yaw, moveDir, target, vx, facing, flipX, asset: {facing, mirror, variant}, facesMove, anim, airborne}]}`: `facing` is read back from the quad's uv, not from a variable. Use it for `window.__state()`. |
| `bb.setParams({filter, mode, shadow, shadowAlpha, push, flashMs, hop, lightProbe, tint})`, `bb.remove(id)`, `bb.dispose()` | |
| `GameDNA_Billboards3D.webglOK()` | `false` = draw your own 2D message instead of making a renderer. |

Sources (the art; all sizes in source pixels):

| source | notes |
|---|---|
| `imageSource({image \| frames: [img...] \| sheet: {image, cols, rows, count}, facing: 'right', mirror: 'ok' \| 'never', variants: {left: {image...}}, walk: [frame indices], idle: 0, cx, baseline, bodyH, stride: 1.1})` | `cx` = feet centre x, `baseline` = feet row (default: the bottom row), `bodyH` = px that equal `h`. Three or more frames = a walk cycle advanced by distance (`stride` heights per cycle); one picture = a hop per half stride. |
| `canvasSource({w, h, footX, footY, bodyH, facing, sides: 'both' \| 'native', mirror, stride, paint(ctx, info)})` | Your own 2D drawing (a rigged character, a code-drawn sprite) rendered to an offscreen canvas -> `CanvasTexture` each frame. `info = {side, anim, k, walkPhase, moving, t, footX, footY, bodyH}`. `sides: 'both'` = paint draws the side it is given. |
| `kitSource(GameDNA_DemoKit, id, {px})` | The GameDNA demo kit (`kit-art.js` + `kit.js`, and the L-10 files for the rigged `sword`, `spear`, `mage`): painted sprites with their painted `@left` / `@right` variants, rigged heroes walking by distance. |

## Integration example (generic)

```js
<script src="three.min.js"></script><script src="billboard-sprites-3d.js"></script>
const bb = GameDNA_Billboards3D.create({ scene, camera, renderer, groundY: (x, z) => terrainHeight(x, z) });
const img = new Image(); img.src = 'knight.png';                       // feet on the bottom row, art looks right
const src = GameDNA_Billboards3D.imageSource({ image: img, facing: 'right', mirror: 'never',
  variants: { left: { image: leftImg } } });                           // painted left side: never mirrored
units.forEach(u => { bb.add({ id: u.id, source: src, x: u.x, z: u.z, h: 1.6 }); u.mesh.visible = false; });
function frame(dt) {                                                  // after the game step and camera move
  units.forEach(u => { bb.move(u.id, u.x, u.z); bb.setTarget(u.id, u.foe ? u.foe.id : null); });
  bb.update(dt);                                                      // dt ms; 0 while paused or frozen
  renderer.render(scene, camera);
}
function onHit(u) { bb.play(u.id, 'hurt'); }                          // flash + recoil, in the material
function onAttack(u) { bb.play(u.id, 'attack', { ms: 500 }); }
function onDeath(u) { bb.play(u.id, 'down'); }                        // later: bb.set(u.id, { alpha: 0 })
const a = bb.anchor(u.id, 'head'); drawBubble(ctx2d, a.x, a.top);     // 2D overlay in CSS px
```

## Self-check without a browser

- `create` once after the scene, camera and renderer exist; `add` once per unit (not per frame); restart / new game:
  `bb.move` to the start spot (a teleport) and `bb.play(id, 'idle')`, or `remove` + `add`.
- `bb.update` runs once per rendered frame, after every camera change (orbit, follow, shake) and before render, also
  on the `?t=` fast-forward path and in paused / frozen frames (`update(0)`).
- `bb.move` gets the FEET position on the floor plane; the module adds the floor height. Do not add the unit's old
  model offset (its half height) to x / z / y.
- Hide the replaced low-poly model (`mesh.visible = false`), but keep it if game code reads its position, raycasts it
  or uses it for picking; keep every caller of the old model working (selection rings, HP bars, autoplay).
- Facing: never set `scale.x = -1` or a yaw by hand. Give `setTarget` the foe / speaker; the module decides the side.
- Hit flash and fades go through `play` / `flash` / `set({alpha})`; do not tint the material yourself.

## Feet during leans

Attack lunges, hurt recoils and falls lean the picture around its feet. The module samples each frame's lowest opaque
pixel per column in the foot band once (needs same-origin or data-URI images; otherwise a fixed 0.16 h foot width is
used) and raises the leaned quad so the lowest foot pixel stays exactly on the ground. Rigged canvas sources animate
their own feet.

## Changes

- 1.0.3: kitSource's rig canvas is 2.4 x 1.82 body heights with the feet at 1.66 (was 1.15 x 1.22): raised weapons in
  cheer / overhead attacks, spear thrusts and the lying `down` pose were cut flat at the canvas edge
  (checks/rig-canvas-edges.py now renders all 1260 poses); foot sampling canvas uses `willReadFrequently`.
- 1.0.2: the hit flash is an over-exposure applied after colour encoding (colour x up to 1.57 at the peak, line work
  stays dark) instead of a mix toward white, which read as a see-through ghost. Shader only; API unchanged.
- 1.0.1: one-shots lock the side against movement (a knockback slide during `hurt` read as walking and turned the
  defender away in a cold test); kitSource starts the rig's `hurt` past its built-in flash so only the material flash
  shows; exact foot raise for leans; `state().flipX` is true when a rig paints the mirrored side.

## Costs and limits

- One draw call per actor (+ one per blob shadow). Canvas sources re-upload their canvas each frame (a rigged hero at
  px 300 is a 720 x 546 canvas).
- Measured (demo, headless Chromium with SwiftShader software GL, median of 3 runs x 40 frames, 1-min load 4.3 at start):
  whole demo frame 1280 x 720 dpr 2 = 169 ms with tilt-shift / 145 ms without; 390 x 844 dpr 3 = 94 / 85 ms. The 14
  billboards (3 rig canvases re-uploaded per frame) are about 8-10 ms of that (hiding them: 120 vs 129 ms); `update()`
  itself is 0.07 ms. Software GL at 2.6 MP is the bottleneck; on a GPU the scene is a few ms.
- Sprites are vertical quads facing the camera: seen from straight above they get thin. Keep the camera pitch
  below about 60 deg (most diorama cameras use 25-45 deg).
- Sorting: blended sprites (default) are sorted back to front by three.js and write depth, so 3D props in front of a
  sprite hide it correctly; `push` moves each quad 0.15 units toward the camera along the view ray (same pixels on
  screen) so sloped ground in front of the feet does not cut them. `alphaMode: 'cutout'` = hard edges, no sorting.
- The light probe only brightens sprites near point lights; painted art keeps its own baked shading.
