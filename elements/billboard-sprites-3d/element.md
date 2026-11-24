# N-02 Painted billboard sprites in a 3D diorama

## What it is

Painted 2D characters standing in a three.js world: each one is a vertical quad that turns (yaw only) to face the
camera, its feet on the floor or tile top under it, a soft contact shadow below. The world is real 3D (terrain,
ruins, trees, lights, fog); the characters are hand-painted pictures. It is the look of "painted sprites in a 3D
diorama": readable silhouettes, warm lights, a tilting camera you can turn.

What makes it right rather than "flat cards in a 3D scene":
- **Facing on screen.** The side a character looks at is read from the camera every frame: its target (or the point
  it walks toward) projected to the screen is to its right or left. Turn the camera 180 deg and a character walking
  north turns around on screen, as it should.
- **No wrong mirror.** `flipX = (want !== art.facing)` in one function; painted left / right variants are used
  instead of mirrors; art marked `mirror: 'never'` (a sword hand, a shield arm, baked light) is never mirrored.
- **Feet on the ground.** The art's foot row is the quad's bottom edge, placed at the floor height; a lean pivots on
  the heel or toe that would sink, so no foot goes below the floor.
- **One-shots own the pose.** During hurt / attack / guard / cast / down, movement (a knockback slide, a lunge)
  never turns the character; the target still does.
- **Walking by distance.** Walk frames (or the rigged hero's walk pose) advance with the distance moved, so feet do not
  slide at any speed; a single picture hops once per half stride.
- **Hit flash in the material.** A hit over-exposes the character itself (shader uniform), never a white box.

## Default parameters

| key | default | meaning |
|---|---|---|
| filter | smooth | smooth = mipmapped painted art; crisp = nearest-neighbour pixel art |
| mode | camera | camera = every quad parallel to the screen (yaw = camera yaw); cylinder = each quad turns toward the camera position |
| shadow | blob | blob = soft ellipse on the ground; sprite = the sprite casts into the shadow map (alpha-tested); both; none |
| flashMs | 200 | hit flash length: full for 60 ms, then fades |
| height | 1.6 | world height of a human; others scale by role (slime 0.4 h, golem 1.45 h) |
| push | 0.15 | quad moved toward the camera along the view ray (same screen pixels) so sloped ground does not cut the feet |
| lightProbe | 0 | brighten sprites near point lights (torches); painted shading stays |

## Variants

- Painted diorama (default): smooth, camera-parallel, blob shadows.
- Pixel pieces: crisp filtering for pixel-art sprites on a 3D board.
- Free-roam camera: cylindrical billboards + sprite shadows for third-person cameras that circle close to characters.

## Interface

Needs: a three.js scene / camera / renderer; per unit per frame its feet x, z and its target id; a floor height
function (or ground meshes); attack / hit / death / restart events; the art (demo kit, or images / canvas painters with
their native facing and painted variants).

Provides: `create`, `add`, `move`, `setTarget`, `play`, `flash`, `set`, `update(dt)`, `anchor(id)` for 2D overlays
(bubbles, numbers, HP bars), `state()` with the drawn side read back from the quad's uv.

## Screen rules (exact numbers)

- Quad bottom edge = the art's foot row (`baseline`), placed at `groundY(x, z)`; lowest opaque row within 1 device
  px of the projected ground contact at dpr 2 (checks/feet.py, 8 moments, every grounded actor).
- Side: target first, then move direction, measured on screen with a dead zone of 0.4 % of the view width (a move
  straight toward / away from the camera keeps the last side).
- Walk: one cycle per `stride` heights walked (L-10 heroes: their own stride; image frames: 1.1 h); hop height
  0.13 h at mid-step.
- Flash: peak 0.6 for 60 ms, then linear to 0 at `flashMs`; applied after colour encoding as an over-exposure (colour x 1 + 0.95 u, + 4 % u of the flash colour): line work stays, lights burn out; alpha never changes.
- Blob shadow: 0.55 h wide x 0.3 h deep, alpha 0.55, shrinks and fades with height above the ground (hover, hop).
- Attack lunge for single pictures: 0.24 h toward the target at the strike (30-44 % of the move), back by 100 %.
- Lean: after rotation the quad is raised by the depth of its lowest foot pixel (sampled per column, lowest 10 % band).

## Common mistakes (symptom -> fix)

- Characters face the wrong way after the camera turns -> the side was taken from world x; use the module's
  `setTarget` / `move`, never a typed facing.
- Sword in the wrong hand on half the characters -> art was mirrored; give the painted variant or `mirror: 'never'`.
- Feet sink into slopes or float above tiles -> pass the feet position, not the model centre; give `groundY` the tile
  top; keep `push` > 0 on uneven ground.
- Sprites jitter or lag the camera by a frame -> `bb.update` ran before the camera moved; call it after.
- Frozen `?t=` stills show sprites edge-on -> the still path renders without `bb.update(0)`.
- Characters slide when walking -> moving the mesh directly; always `bb.move` so the walked distance drives frames.
- A white rectangle on hit -> a flash drawn as a quad; use `bb.play(id, 'hurt')` / `bb.flash`.
- Dark fringes around sprites -> premultiplied or non-sRGB art; the module sets sRGB when the renderer outputs sRGB.

## Acceptance moments

Demo (`demo/index.html`, 32.5 s loop, `?t=&freeze=1`):
- `t=3200` heroes walk in (walk pose by distance), herbalist looks at them.
- `t=7750` slimes hop in, the spear fighter shouts (bubble anchored by `bb.anchor`).
- `t=9450` sword slash lands on a slime: slime flashes in the material, spark between them, all face their foes.
- `t=16300` the golem strikes the swordswoman (flash, recoil); everyone faces the golem.
- `t=20650` the golem falls (down pose, fade).
- `t=25500` the party walks to the campfire; the camera has swayed about 30 deg and every side is still right.
- `?probe=1`: facing grid, 8 move directions x 4 camera yaws (checks/facing-3d/sheet.png).
