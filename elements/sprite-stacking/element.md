# K-02 Sprite stacking

## What it is

Pseudo-3D props made of stacked pixel slices. Each prop is a small voxel model (a crate is 10 x 10 x 9 voxels, a cottage
30 x 22 x 24) built in code or written as slice data (one picture per height layer). For one view angle the model is
baked into a picture: its slices are drawn bottom to top, one screen row of height after the other, so the object looks
solid from every side and can turn freely. Light comes from one direction (upper left), every pixel is shaded by the
face it shows (top, lit side, shaded side, front), the silhouette gets a 1 px outline and the object casts a shadow on
the ground. The game's characters stay flat sprites; every frame they are put in one list with the stacks and sorted by
their ground footprints in camera space, so a villager walks behind the well and in front of the stall from any side,
under any camera angle.

Two ways to turn things: single objects by their own `angle` (a cart facing its heading, crates at random angles), and a
turning camera (`setCamera({yaw})`) for games whose ground can turn with the objects.

## Default parameters

| key | default | meaning |
|---|---|---|
| `voxel` | 1 | world px per voxel (2 on 40 px tile HD games) |
| `lift` | = voxel | screen px of height per slice |
| `pitch` | 1 | ground squash (1 = the game draws its ground straight top-down; 0.78 in the demo's turning town) |
| `steps` | 128 | cached angle steps per turn (2.8 degrees); 0 = exact angles |
| `outline` | on | 1 px dark outline around each object |
| `shadows` | 0.3 | cast shadow alpha; `shadowLength` 0.55 of the height |
| `light` | -0.62 | light direction (radians): upper left |
| `res` | auto | bake resolution = the canvas transform's scale, so an HD canvas gets sharp pictures |

## Variants

- **Tile props (default)**: `voxel 1, lift 1, pitch 1`, fixed camera; trees, rocks, wells, fences and house blocks replace their tiles.
- **Turning town**: `pitch 0.78`, the camera turns (drag, Q / E), ground drawn through `groundTransform`.
- **Chunky voxels**: `voxel 2` on a 40 px tile HD game (models at half their pixel size, bigger blocks).
- **Tall slices**: `lift 1.6` stretches height without new data.

## Interface

Needs: the props as data with their ground centre in world px; one draw list per frame with the stacks and every flat
sprite (`{x, y, w, h, draw}`, feet in world px); the ground drawn first (plain ground where a stack replaced a tile).

Provides: `item(name, x, y, {angle, seed, size, model})`, `draw(ctx, list)` (sort + draw), `drawShadows(ctx, list)`,
`sort / order`, `setCamera / groundTransform / project / screenDir` for a turning camera, `define(name, sliceData)` for new
models, `drawModel` / `slices` for previews, `stats()` and `lastDrawn()` for judges. Built-in models: crate, barrel, tree
(oak, autumn), pine, bush, rock, house (any size, roof red / blue / slate / thatch / green), well, stall, cart, buggy, lamp,
fence, chest, sign.

## Screen rules

- Slices: every screen row between a slice and the next is filled (an interior voxel shows on every row of its slice at
  any angle, lift 0.5..3, pitch 0.3..1); thin parts (1-voxel posts) never drop out at diagonal angles.
- Depth: for objects whose footprints are apart, the drawn order matches a per-pixel depth buffer exactly (depth = ground
  distance toward the camera + height x pitch): 0 wrong pixels for every pair at 24 places around each other x 12
  camera angles, and in 40 random crowded scenes.
- Rotation: the bottom slice stays on its anchor within 1 px at every angle; two neighbouring angle steps overlap >= 0.7.
- Shading: top faces lightest, faces turned to the light lighter, faces turned away darker, the bottom two layers a
  little darker (contact); shadows cooler, highlights warmer; glowing voxels (lanterns, windows) unshaded.
- Characters are never part of a stack; their feet x, y and width decide their place in the order.
- The demo: 384 x 216 native (256 x 144 on phones, a closer view of the same world), whole device pixels per pixel, the
  camera turns once in 24 s; no text on the canvas (the caption and compass are page HTML).

## Common mistakes

| symptom | fix |
|---|---|
| A character is drawn over a house it stands behind | the character is drawn outside `draw(ctx, list)` (or before it); put every sprite in the list |
| Characters sorted wrongly beside long or turned props | the flat item has no `x` (sorted by y only, `stats().flatNoX`); give feet `x` and `w` |
| The old flat tree shows under the stacked one | the replaced tile still draws its art; draw plain ground there |
| A tall house pops in at the bottom of the screen | the prop loop stops at the last visible row; include ~3 rows below |
| Objects turn but the ground does not | `yaw` set on a game whose ground cannot turn; keep yaw 0 and turn objects with `angle`, or draw the ground with `groundTransform` |
| Characters walk into props | footprints larger than the game's solid area; size models to the tile / block the game already blocks |
| Holes between slices with a big `lift` | a hand-written renderer that draws each slice once; use the module (it fills every row) |

## Acceptance moments

`demo/index.html` (see `checks/state.json`; the camera angle is in the caption and the compass):

| `?t=` | shows |
|---|---|
| 600 | camera 29 deg: the hero in front of the well; the elder in front of the blue-roof cottage |
| 1900 | the guard behind the blue market stall (its awning covers his legs) |
| 4500 | camera 88 deg: the hero now on the far side of the well, partly hidden |
| 5700 | stack against stack: the buggy behind an oak by the ring road |
| 6700 | the guard passing a crate on its near side |
| 8800 | camera 152 deg: the same elder at the same spot, now behind the cottage's side wall |
| 9600 | a lamp post in front of the walking villager |
| 16200 | camera 263 deg: the hero in front of the well, seen from the other side |
| 20100 | camera 322 deg: the well hides the hero |

The gallery under the stage turns every built-in model; clicking one lists its slices.
