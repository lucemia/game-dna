# Prompt templates: art-direction lock (L-00)

Fill every `<...>`. Keep every sentence that says original / no text / no logo / no watermark: `namecheck.py --require-guard` refuses a prompt without them, and refuses names of real games, franchises, characters, brands, studios and living artists, and "in the style of <Name>". Describe the look in plain words instead.

## 1. Style lock paragraph (write once per game; paste unchanged at the end of EVERY prompt)

```
STYLE LOCK (identical in every prompt of this set): <medium, e.g. modern hand-painted 2D game art | clean vector-like cel art | soft painterly 2D> for an original <genre> game; <brushwork / rendering, e.g. soft painterly brushwork over clean readable shapes>; <camera: strict side view | three-quarter top-down view, camera looking down at about 35 degrees>; one key light from the <TOP-LEFT>, <light mood, e.g. warm highlights against cool shadows>; <outline, e.g. a thin dark warm-brown outline around every object>; <palette: 4-6 colour words>; <shadow rule, e.g. gentle contact shadows painted under feet and bases only>; <proportions, e.g. characters about 3.5 heads tall>. Original, no resemblance to any existing game, film or franchise character, no text, no logo, no watermark.
```

Pick visual traits that are not the genre's best-known cliché: a young hero in a green tunic, a blue slime with a smiling face or a spiky-haired swordsman reads as a copy of a famous character even when no name is used. Change at least two of colour, outfit, silhouette and prop.

Pick the camera from the game: a top-down map needs the three-quarter top-down view; a side-scroller needs strict side view.

## 2. Reference sheet (1 image, `transparent_background: true`, no reference)

```
Style reference sheet for an original <theme in a few words> game. Wide landscape canvas, fully transparent background (real alpha), four separate items in one row with clear transparent space between them, all at the same game scale:
1. LEFT: one full-body character, <the game's hero: 3 visual traits>; standing idle, facing <down-right | right>.
2. CENTRE-LEFT: one prop, <a signature object of the game's world>.
3. CENTRE-RIGHT: one ground patch, a roughly square patch of <the game's main floor material> seen from the game camera, with softly irregular edges.
4. RIGHT: one small inventory icon, <an item from the game>, drawn larger than game scale and centred.
No labels, no captions, no colour swatches, no grid lines, no frames around the items.

<STYLE LOCK paragraph>
```

Save it unchanged (it is the lock). If it is wrong (text in it, items touching, wrong camera), regenerate it before deriving anything; never fix it with code.

## 3. Derived asset (pass the sheet's path in `referenced_image_paths` on every call)

Start every derived prompt with:

```
Match the attached style reference sheet exactly in rendering: same brushwork, outline weight and colour, light direction, palette, camera angle and proportions. Do not copy its items or its layout; draw only the new asset described here.
```

then ONE body, then the STYLE LOCK paragraph:

| asset | body | `transparent_background` |
|---|---|---|
| character | `One full-body game character: an original <role>, <3 visual traits>; standing idle, facing <dir>. Square canvas, the whole character centred with a small transparent margin, fully transparent background (real alpha).` | true |
| prop | `One game prop: <object, 2-3 details>. Square canvas, the whole prop centred with a small transparent margin, fully transparent background (real alpha).` | true |
| ground tile | `One seamless tileable ground texture for the game floor, seen from the game camera: <material>, soft even light, no objects, no perspective lines; it must wrap with no seams (left edge continues into right edge, top into bottom). Square canvas, fully opaque, filled edge to edge.` | false |
| icon | `One inventory icon: <item>, slightly tilted, centred and filling about 80% of a square canvas, fully transparent background (real alpha).` | true |
| variant of an existing asset | `Edit the first referenced image: change ONLY <what changes>; keep identity, outline, palette, framing, canvas and transparent background.` (pass the asset first, the sheet second) | same as the asset |

## 4. Post-process recipes (`postproc.py`, Python + Pillow)

Size = the size the game draws it at, times the canvas backing scale (1x for a fixed low-resolution canvas, 2x for an HD canvas shown on high-DPI screens).

| asset | chain |
|---|---|
| character, prop | `trim` → `resize --h <drawn height x scale>` → `alpha --defringe 3` → `export .webp --quality 86` |
| ground tile | `seam --mode tile` → `resize --size <tile x scale>x<tile x scale> --wrap xy` → `export .webp --quality 95` (lower quality reopens the seam; or `.png`) |
| icon | `trim` → `resize --fit <slot>x<slot>` → `alpha --defringe 3` → `export` |
| a part of the sheet | `pick --index <0..3>` first, then as above |

Then list every file in `assets.json` (format in `tools/README.md`), run `postproc.py build assets.json` and `assetcheck.py assets.json` until it prints `"ok": true`.
