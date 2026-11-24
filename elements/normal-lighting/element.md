# J-02 Normal-mapped sprite lighting

## What it is

Flat 2D sprites gain light and form. Each sprite the game draws through the module writes its normals (which way every pixel faces) into a normal buffer, and its colour into an albedo buffer. One WebGL pass on the I-08 post chain then relights only those pixels: a directional key light (sun, moon), up to 8 point lights (lamps, torches, a carried lantern, a passing wisp, short flashes on hits and spells, and the J-01 dynamic lights when they are on the same post), specular glints on curved edges and a rim light along silhouettes. A face turned to the viewer keeps its painted colour exactly; faces turned toward a light brighten, faces turned away darken. As a lantern walks past a well, the stones facing it light up and the far side falls into shade.

Normals come from an L-05 normal map (`nh2`, with its gloss mask) for painted bitmaps, from any `gl` / `dx` map, or are derived at runtime from a bitmap (`'derive'`) or from a sprite drawn with canvas calls (`shape()`: the module watches the sprite's own draw calls on a scratch canvas and builds a rounded height field from its alpha and shading). Without WebGL, or without a map, the sprite draws exactly as before.

## Default parameters

| param | default (`daylight`) | |
|---|---|---|
| preset | daylight | daylight (no lamps or darkness), dusk (lamps, J-01 at dusk), night, soft |
| strength | 1.4 | relief, 0..2 |
| key / keyAngle / keyHeight | 0.6 / 225° (from up-left) / 0.35 | directional key light (low = raking, strong form) |
| keyColor / shadowColor / warmth | #ffd9a0 / #7f9cff / 0.6 | warm faces toward the key, cool faces away (hue only, brightness kept) |
| backside | 1 | share of the darkening on faces turned away |
| points / fill / lightHeight | 1 / 0.35 / 30 view px | point lights: intensity, extra light on faces toward them, height above the sprites |
| specular / gloss | 0.25 / 18 | glints on curved edges toward a light |
| rim / rimColor / rimAngle / rimWidth / pointRim | 0.7 / #bfe0ff / 315° (from up-right, behind) / 2.5 / 0.6 | rim light (multiplies the edge colour; never on the feet) |
| bevel / detail | 8 view px / 0.2 | derived normals: edge rounding, shading bumps |
| overdraw | true | pixels drawn over a sprite later stay unlit |
| normalFormat | auto | nh2 when the map is twice as wide as the sprite, else gl |

## Variants

- **Daylight** (default): a lamp-less game; warm sun from up-left at a low height, cool sky shadows, rim from up-right. Visible form at 1x with no lights at all.
- **Dusk lanterns**: key 0.35, fill 0.4, pointRim 0.9, specular 0.4; lamps and J-01 do most of the light.
- **Torch-lit night**: bluish key 0.2, fill 0.5.
- **Soft relief**: strength 0.8, gentle, for busy or small sprites.
- **Strong noon relief**: daylight with strength 1.8, keyHeight 0.3, warmth 0.8.

## Interface

Needs: I-08 `webgl-post.js` loaded first (the game's post instance or one the module creates); `render()` on every draw path; a step-counted clock; the sprites' draw calls (`drawSprite(img, map, ...)` for bitmaps, `shape(key, box, fn)` around canvas-drawn sprites); optionally a camera for world-unit lights, lights and flashes, L-05 maps, J-01 lights on the same post.

Provides: one pass (`normal-light`, order 250, after J-01's 200, before distortion 350 and bloom 600), skipped on frames with no sprite; inputs `nlNormal` / `nlAlbedo`; own lights and flashes; runtime normal derivation; `stats()`, `drawnBoxes()`, `lightsNow()`.

## Screen rules

- Only pixels of sprites drawn through the module change; ground, sky, backgrounds and HUD are pixel-identical to the 2D frame (judge `outDiff` ≈ 0 when no other pass runs).
- Energy-neutral relief: brightness × (1 + 0.7 e), e = strength × key × (n.xy · L.xy) (+ the same per point light). A pixel facing the viewer keeps factor 1.00 under any light; at the defaults an edge facing the key gets × 1.54 (warmer), the edge facing away × 0.46 (cooler): a round sprite keeps its mean. Colour tints are luminance-normalised (hue shift only); a soft shoulder above 0.8 scales all three channels together, so nothing clips to white or greys out.
- Point light: attenuation (1 − d / radius)², light height 30 view px; at most 8 lights per frame, strongest near the view first.
- Flashes fade as (1 − age)² over `ms` (default 260 ms) of game time; the same spot within 50 ms merges.
- Mirrored sprites (`scale(-1, 1)`) negate their map's x normals: the lit side stays toward the light.
- Pixels drawn over a sprite later without the module (colour differs from the albedo by more than ~0.07–0.2) fade to unlit.
- Derived shapes: rounded edge of `bevel` view px (quarter-circle profile), luminance bumps × `detail`; regions over 160 000 px are derived at a lower resolution.

## Common mistakes

| symptom | fix |
|---|---|
| Nothing changes | `nl.render()` missing on the draw path, sprites not drawn through `drawSprite` / `shape`, or the map is cross-origin (`stats().tainted`). |
| A sprite is only half lit, cut at a straight line | its `shape` box is too small or in the wrong coordinates (outside the camera transform); box the whole sprite in the coordinates active at that call. |
| Ground or a background has pillow edges | it was wrapped; wrap sprites only. |
| A tree in front of the hero gets the hero's shading | the tree is drawn outside the module: with `overdraw` on it is left unlit; wrap the tree too so the sort order carries its own normals. |
| Lit from the wrong side after turning | the sprite is mirrored by redrawing a different image, not by the transform; give that image its own map. |
| Frame time climbs | dozens of unkeyed static shapes derive every frame; give unchanging things a key. |
| Lights slide when the camera moves | `camera` missing or returns a different offset than the draw. |
| `?t=&freeze=1` still has no lighting | the single draw after the fast-forward does not reach `nl.render()`. |

## Acceptance moments

1. Demo, dusk: the keeper walks past the oak while the wisp circles it; the side of the trunk and of the keeper facing the wisp turn teal, the far side falls to shade; the green slime in the lamppost's pool shows its dome. `?t=3000&freeze=1`.
2. Demo daylight (`?preset=daylight&t=6000&freeze=1`, no lamps): the oak, well and characters are warm and bright toward up-left, cool and darker toward down-right, as bright overall as `&normals_on=0`.
3. Demo split (`?split=0.74`): the line cuts through the well; its left half is flat, its right half lit.
4. Demo `?debug=normals`: the normal buffer shows smooth rainbow-edged shapes for every sprite, a slime hopping left (mirrored) with x flipped.
5. Host (hd-topdown, preset daylight): at 1x the trees, rocks, crates and actors read as domes lit warm from up-left; a sword hit flashes warm light on the target.
6. `?webgl=0`: the demo and both hosts are pixel-identical to the plain game.
