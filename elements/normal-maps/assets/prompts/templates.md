# Prompt templates and commands: material & normal maps (L-05)

Fill every `<...>`. Keep every sentence that says original / no text / no logo / no watermark: `namecheck.py --require-guard`
refuses a prompt without them, and refuses names of real games, franchises, characters, brands, studios and living
artists, and "in the style of <Name>". Describe the look in plain words instead.

## 1. Style lock paragraph (write once per game; paste unchanged at the end of EVERY prompt)

```
STYLE LOCK (identical in every prompt of this set): <medium, e.g. modern hand-painted 2D game art | soft painterly 2D | clean cel-shaded 2D> for an original <genre> game; <brushwork, e.g. soft painterly brushwork over clean readable shapes>; <camera: strict side view | three-quarter top-down view, camera looking down at about 35 degrees>; soft, even, neutral light with only gentle shading (the game adds its own lights; no strong cast shadows, no rim light, no glow painted in); <outline, e.g. a thin dark warm-brown outline around every object>; <palette: 4-6 colour words from the game>; <proportions, e.g. characters about 3.5 heads tall>. Original, no resemblance to any existing game, film or franchise character, no text, no logo, no watermark.
```

- Pick the camera from the game: a top-down map needs the three-quarter top-down view; a side-scroller strict side view.
- Ask for **even, neutral light**: the normal map adds the direction. A picture with a strong painted key light looks lit
  twice when a game light comes from the other side.
- Avoid the genre's best-known cliché (a young hero in a green tunic, a smiling blue slime, a spiky-haired swordsman):
  change at least two of colour, outfit, silhouette and prop.

## 2. The subject (one image, `transparent_background: true`, no reference image)

| subject | body |
|---|---|
| back view (only if the old sprite has one when facing up) | `Edit the referenced character: the same character seen from behind, walking away from the camera; same outfit, colours, proportions, outline, canvas and transparent background.` (pass the front picture in `referenced_image_paths`) |
| character | `One full-body game character for an original <theme> game: <role>, <3 visual traits from the game's own colours>; standing idle, facing <right / down-right, the way the game's sprite faces>, whole body visible, arms not touching the edges. Square canvas, the character centred with a transparent margin of about 10 %, fully transparent background (real alpha), no ground, no cast shadow, no floor patch.` |
| prop | `One game prop for an original <theme> game: <object, 2-3 details of its material: stone, wood, metal, cloth>, seen from the game camera, whole object visible. Square canvas, centred with a transparent margin of about 10 %, fully transparent background (real alpha), no ground, no cast shadow.` |

Then the STYLE LOCK paragraph. Ask for **no cast shadow and no floor patch**: anything opaque under the feet becomes a
raised pillow in the height map (the game draws its own shadow).

Save the untouched PNG as `art/gen/<run>/<file>.png` and write `art/gen/<run>/GEN.md` (the exact prompt sent, the tool,
`transparent_background`, the original saved path). Regenerate (at most 3 tries) when the image has text, a frame, a
floor patch, a cut-off limb or no transparent background; never fix the picture with code.

## 3. Post-process and derive (Python + Pillow: `uv run --with pillow python ...` or `./.venv/bin/python ...`)

Size = the height the game draws it at x 2 (HD canvas on high-DPI screens; x 1 for a fixed canvas that is never scaled up).

`art/assets.json` (format `gamedna-assets/1`, see `tools/README.md`), paths relative to `art/`:

```json
{ "format": "gamedna-assets/1", "pack": "<game> normal-mapped sprites", "budgetBytes": 600000,
  "styleLock": {"text": "style-lock.txt"},
  "assets": [
    { "key": "<key>", "role": "sprite", "file": "albedo/<key>.webp", "alpha": true, "anchor": [0.5, 1], "drawH": <drawn height>,
      "source": {"run": "gen/<run>", "file": "<file>.png"}, "prompt": ["gen/<run>/GEN.md", "style-lock.txt"],
      "post": ["trim", {"resize": {"h": <drawn height x 2>}}, {"alpha": {"defringe": 3}}, {"export": {"quality": 90}}] },
    { "key": "<key>-nh", "role": "normalmap", "file": "maps/<key>.nh.webp", "derivedFrom": "<key>", "params": {} } ] }
```

Then (`postproc.py build` runs each entry's `post` chain from its source PNG and writes `file`):

```sh
python tools/postproc.py build art/assets.json           # writes albedo/<key>.webp, fills w, h, bytes, sha256
python tools/normalmap.py build art/assets.json          # derives maps/<key>.nh.webp, fills its w, h, sha256, albedoSha256, sets "normal" on the albedo
python tools/assetcheck.py art/assets.json               # until "ok": true (provenance is checked by the runner afterwards)
python tools/normalmap.py preview art/albedo/<key>.webp art/maps/<key>.nh.webp art/lit-preview.png --light 0.9,0.1,0.3   # optional look
```

`params` (all optional): `floor` 0.08 (the lowest 8 % of a standing subject, its painted contact shadow, stays flat ground; 0 for icons and busts), `cut` "bottom" for busts, `strength` 0.8 (how round the silhouette is, 0.4 flat .. 1.2 very round), `detail` 2.5 (bump depth
in px from the painting's light and dark), `dome` "auto" (rounding radius px), `ao` 0.8, `gloss` 0.25 (0 cloth .. 0.6 metal,
glass). Re-run `normalmap.py build` after changing them.

## 4. Lights in the game (what to pass to `GameDNA_NormalMaps.create`)

| scene | `ambient` | lights |
|---|---|---|
| bright day | 0.8 | `key: {x: -0.5, y: 0.7, z: 0.6, intensity: 0.25}` (sun): with it the sprite is as bright as the game's world (never darker than the scene around it); a lantern on the hero at hand height (`z` 30, `intensity` 1.6-1.8) shows a lit and a shadow side on sprites near it |
| dusk / indoor | 0.45-0.55 | a lantern on the hero (`radius` ~ 1/3 of the view width), every lamp, fire, glowing pickup or projectile |
| night / cave | 0.2-0.35 | as dusk, `intensity` 1.5-1.8, `key: {x: 0.8, y: 0.45, z: 0.3, color: '#5f7dff', intensity: 0.9}` for a cold moon |

If the game already darkens its whole scene (a night overlay, a light map), use `ambient` 0.85-1 so the sprite is not
darkened twice.
