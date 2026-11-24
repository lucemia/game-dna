# GameDNA_NormalMaps (L-05 Material & normal maps, module v1.2)

`normal-maps.js` is one plain script (no imports, no dependencies) that defines one global, `GameDNA_NormalMaps`. It
draws a painted bitmap **lit by the game's lights** on an ordinary 2D canvas, using the bitmap's derived normal and
material map. It reads both images through `GameDNA_Assets` (the L-00 loader, `art-direction-lock.js`). Paste it
verbatim into a `<script>` tag (or `<script src>`) after `art-direction-lock.js`. Do not rewrite it.

## The files it needs

Each sprite is two files listed in the same manifest: the **albedo** (the picture, with alpha) and its **map**
(`<key>-nh`, or the key named by the albedo's `normal` field). The map is made by `tools/normalmap.py` (Python + Pillow)
from the albedo and is one opaque RGB file twice as wide as the albedo ("nh2" layout):

| half | R | G | B |
|---|---|---|---|
| left (x < w): normal | x (+ right) | y (+ UP on screen) | z (+ toward the viewer) |
| right (x >= w): material | height | ambient occlusion | gloss |

`uv run --with pillow python tools/normalmap.py build assets.json` derives every `role: "normalmap"` entry and records
`w`, `h`, `sha256`, `albedoSha256`; `tools/assetcheck.py assets.json` re-derives each map and must print `"ok": true`.

## API

`GameDNA_NormalMaps.create(options) -> nm` (each instance is also listed in `GameDNA_NormalMaps.instances()`)

| option | default | |
|---|---|---|
| `assets` | `GameDNA_Assets` | the loader (anything with `get(key) -> {img, w, h, meta}`) |
| `lights` | none | array, or a function returning an array, of `{x, y, z?, radius, color, intensity, on?}` in the **same coordinates you pass to `draw`** (world px if you draw inside `ctx.translate(-camX, -camY)`). `z` = height of the light above the ground in px (default `lightZ`). |
| `ambient` | 0.7 | brightness where no light reaches (1 = the picture as painted). Daylight 0.8 with the default-strength key light (0.25-0.35): the sprite is then as bright as the game's world, never darker than the scene around it; dusk 0.45-0.55, night 0.2-0.35 |
| `ambientColor` | `'#ffffff'` | tint of the ambient |
| `key` | `{x: -0.55, y: 0.6, z: 0.6, color: '#fff3e0', intensity: 0.35}` | a directional "sun / moon" light, vector toward the light, **y up**; `false` = none |
| `lightZ` | 48 | default light height in px |
| `strength` | 1 | multiplies every point light |
| `wrap` | 0.15 | share of each point light that reaches the whole sprite regardless of direction (higher = softer, flatter) |
| `rim` | 0.4 | edges turned toward a light catch its colour (strength of the rim term, 0 = off) |
| `maxLights` | 3 | strongest point lights per sprite |
| `sizeStep` | 1 | device sizes are rounded to this many px (4-8 = fewer cache builds when a size animates) |
| `maxLight` | 1.3 | ambient + added light never exceed this x the painted colour (no wash-out under many lights) |
| `smoothing` | `'low'` | `imageSmoothingQuality` used when caching (low matches a plain `drawImage`) |

| call | returns | |
|---|---|---|
| `draw(ctx, key, x, y, o)` | bool | Same placement as `GameDNA_Assets.draw`: the asset's anchor (default bottom centre = feet) at `(x, y)`; `o = {h, w, scale, flip, alpha, anchor}`, size from `o.h` / `o.w` / `o.scale`, else the entry's `drawH`, else the file size. Per call you may also pass `flash` (0..1: the picture's own silhouette whitened over it, for hurt flashes; never draw the old sprite over the new one), `lights`, `ambient`, `key`, `normals: false` (a flat card that receives the same light energy spread evenly, for comparisons), `lit: false` (plain picture). **Returns `false` and draws nothing only when the albedo is missing** (keep your old drawing as the fallback). When the map is missing or unreadable it draws the plain picture and returns `true`. Never throws. |
| `has(key)` / `why(key)` | bool / string | map ready? / why not (`''` when fine) |
| `maps(key)` | `{w, h, albedo, normal, height, ao, gloss, packed}` canvases, or null | for viewers and WebGL uploads |
| `sample(key, x, y)` | `{n: [x, y, z], height, ao, gloss}` or null | one albedo pixel |
| `setLights(arrOrFn)`, `set(name, value)`, `params()` | | `set('ambient', 0.4)`, `set('key', false)`, `set('enabled', false)` |
| `stats()` | `{draws, lit, flat, missing, builds, buildMs, prepared, errors, reason}` | `flat` = drawn without lighting |

`?normals=0` in the page URL turns lighting off (plain pictures) for A/B checks.

## How it lights (and what it costs)

Per sprite, drawn size and light colour it builds five small canvases once (albedo x max(0, ±nx), ±ny, +nz, plus a gloss
sheen and a rim term), then each frame draws the ambient base and, per light, 2-3 of them with `'lighter'` and `globalAlpha` = the light
direction's components x attenuation (smooth falloff to 0 at `radius`, measured to the nearest point of the sprite box).
The direction is taken from the sprite's centre, so one sprite is lit as one object (no per-pixel falloff). Output
depends only on the inputs: `?t=&freeze=1` stills equal play. The cached canvases are built at the size the sprite lands
on the device (drawn size x the context's scale) and drawn on whole device pixels, so a lit sprite is as sharp as the
plain one. Measured in the demo (headless Chromium, software canvas, 1086 px wide, 6 sprites, 3 point lights + key
light): 2.4 ms per frame vs 1.2 ms for the same sprites drawn plain; the first frame costs ~20 ms (cache builds); at
390 px (dpr 3, 712 px canvas) 1.1 ms vs 0.6 ms. Sizes that change every frame rebuild every frame: pass `sizeStep: 4`
(or 8) to round them.

**Serve the page over http(s).** A page opened as `file://` cannot read image pixels: sprites then draw plain (no
lighting), `stats().reason` says why, nothing throws.

## Choosing pictures and lights (rules from the cold tests)

- **One picture per character** on screen: never show the same picture as two different characters at once.
- **States stay visible.** A thing whose look shows game state (lit / unlit lamp, active checkpoint, open door) is replaced only when the pack has every state, picked from the state each frame: the sample pack has `lamppost` (lit) and `lamppost-off` (unlit, same post; manifest `state: {of: 'lamppost', lit}`). Otherwise keep its old drawing.
- **Hurt flash and blink**: `flash` and `alpha` on `draw`; the old drawing is only the fallback when the picture is missing.
- **Facings**: one picture faces right; `flip` mirrors it for left. Never switch between the picture and the old drawing by facing: use pictures for every facing (a back view generated as an edit of the front, or the front picture), or keep that character's old drawing throughout.
- **Weapons and effects**: replace only the body. Keep drawing the old weapon, swing arc and attack effects after `nm.draw`, so attacks stay visible.
- **Ground shadow**: the sample people (keeper, herbalist) have a painted contact shadow; drop the game's own shadow ellipse under them.
- **Lights where the source is drawn**: a carried lantern at the painted lantern (lamppost: 25 % across, 42 % down the picture; keeper: 87 % across, 64 % down; mirrored when flipped), at most ~8 lights from visible sources (lamps, fires, glowing projectiles), not every coin or eye.

## Integration example (generic)

```js
<script src="art-direction-lock.js"></script><script src="normal-maps.js"></script>
<script>
const ART = { assets: [   // from assets.json: both the albedo and its -nh map, src relative to the page
  { key: 'guard', src: 'art/albedo/guard.webp', anchor: [0.5, 1], drawH: 64, normal: 'guard-nh' },
  { key: 'guard-nh', src: 'art/maps/guard.nh.webp', role: 'normalmap', derivedFrom: 'guard' } ] };
const lamps = [];                                      // the game's light sources, world px
const nm = GameDNA_NormalMaps.create({ assets: GameDNA_Assets, ambient: 0.45,
  lights: () => [{ x: hero.x, y: hero.y - 30, radius: 220, color: '#ffb35a', intensity: 1.4 }].concat(lamps) });
function boot() { /* the game's old start code, unchanged */ }
GameDNA_Assets.load(ART, { onReady: boot });
// in the draw pass, where the old guard was drawn (inside the camera translate):
if (!nm.draw(ctx, 'guard', g.x, g.y, { h: 64, flip: g.face < 0 })) drawOldGuard(g);
// level start: lamps.length = 0; for (const t of torches) lamps.push({ x: t.x, y: t.y, radius: 180, color: '#ff9a4a', intensity: 1 });
</script>
```

## Self-check without a browser

1. Both script files are byte-identical to the ones given; `art-direction-lock.js` loads first.
2. The boot runs once, from `onReady`; `?t=<ms>&freeze=1` still renders one frame; `?auto=1` still finishes; restart does not reload images or create a new instance.
3. Every `nm.draw` is inside `if (!…)` that keeps the old drawing; hit boxes and rules do not read image sizes.
4. Lights and draw calls use the same coordinates (both world, or both screen); the hero's lantern light sits on the hero.
5. Lights come from game state only (no `Date.now()`, no `Math.random()` in the draw); a flicker uses the game clock.
6. Walk one example: ambient 0.45, one light of intensity 1.4 at half its radius from the sprite: attenuation 0.5 -> the facing edge gets about 0.45 + 0.7 x (0.15 wrap + direction) of its painted colour plus a rim of the light's colour; the far edge stays near 0.45 + 0.1.
