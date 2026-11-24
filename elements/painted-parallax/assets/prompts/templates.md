# Prompt templates: painted parallax layers (L-01)

Fill every `<...>`. Keep every sentence that says original / no text / no logo / no watermark: `namecheck.py --require-guard` refuses a prompt without them, and refuses names of real games, franchises, characters, brands, studios and living artists, and "in the style of <Name>". Describe the look in plain words instead. Generate only with your built-in image tool (image_gen), one call per image; never draw or repaint a layer with code.

## 0. Plan the set

| layer | role | `transparent_background` | scroll factor | what |
|---|---|---|---|---|
| far | `far` | false | 0.16 | sky + distant ridges + a mist band at the bottom (nearer layers cover it) |
| clouds (optional) | `clouds` | true | 0.08 + slow drift | a few cloud bands in the upper 45 %, edges clear |
| mid | `mid` | true | 0.48 | hills / buildings / cliffs band, everything above transparent; two panels A + B |
| near | `near` | true | 0.72 | dark silhouettes on a ground strip along the bottom; two panels A + B |
| under | `under` | false | 0.72 | the forest floor / bank BELOW the near layer's ground line, opaque; two images A + B in one call. Shown only when the game's ground is higher than the painted one (`ground` < 1, the usual case for platformers); without it that area is a flat colour |

The tool picks the canvas (seen: 1774×887, 2172×724, 1672×941); a wide one is normal. Two panels joined give a strip about 3 screens wide, so the repeat is hard to spot.

## 1. Style lock paragraph (write once; paste unchanged at the end of EVERY prompt)

```
STYLE LOCK (identical in every prompt of this set): <medium, e.g. modern hand-painted 2D game background art> for an original side-scrolling <genre> game; <brushwork, e.g. soft painterly brushwork with restrained visible brush texture over clean, readable silhouettes>; strict side view, horizon at about <45>% of the image height, no perspective lines; the light comes from <a low sun | the moon | a glow> hidden BEHIND the far <ridges | skyline> and glows evenly along the whole horizon, giving every top edge a thin <warm> rim light against <cool> shadowed fronts; strong atmospheric perspective: every step back is lighter, <bluer>, softer and lower in contrast; no outlines, shapes are separated by value; palette: <5-6 colour words>; quiet, spacious composition with no single focal point and no left-to-right light gradient. Original, no resemblance to any existing game, film or franchise character, no text, no logo, no watermark.
```

The light must come from BEHIND the far plane (or be even): a sun on one side gives a left-to-right gradient that can never repeat.

## 2. Style key painting (1 image, opaque, no reference)

```
Style key painting for the backgrounds of an original side-scrolling game set in <place> at <time of day>. One wide landscape painting that shows every depth plane of the place together, from back to front: <sky and clouds>; <distant shapes fading into mist>; <a middle band of ...>; and along the bottom edge <dark near silhouettes>. Fully opaque, filled edge to edge. No characters, no animals, <no buildings,> no roads, no text.

<STYLE LOCK paragraph>
```

Save it unchanged (it is the lock). Regenerate it if it has text, a strong focal point or a sun on one side.

## 3. Layers (pass the key's absolute path in `referenced_image_paths` on every call)

Start every layer prompt with:

```
Match the attached style key painting exactly in rendering: same brushwork, rim light, palette, atmospheric depth and the same scale of <hills and trees>. Do not copy its layout; draw only the one parallax layer described here, for a game that scrolls sideways and repeats this layer horizontally.
```

then ONE body, then the STYLE LOCK paragraph:

| layer | body |
|---|---|
| far | `FAR layer of <place> at <time>: the sky (<top colour> at the top to <horizon colour> at the horizon) with a few faint cloud streaks low in the sky, and <two ranges of distant ...> fading into mist, their top line at about 40-50% of the image height; below them a soft band of pale mist down to the bottom edge (nearer layers cover it). No foreground. Wide landscape canvas, fully opaque, filled edge to edge. SEAMLESS REPEAT RULE: the left and right edges must continue into each other: the same sky colours at the same heights, the skyline low and at the same height at both edges, the same mist band; even light across the whole width.` |
| clouds | `CLOUD layer of <place> at <time>: four long, thin, wispy cloud streaks of different lengths, lit <colour> from below, with SOFT, FEATHERED, gradually fading edges all round (no flat bottoms, no sawtooth tufts, no cut-out outlines), spread across the upper 35% of the image only: no cloud lower than 38% of the image height; plenty of open space; nothing else. Wide landscape canvas, everything that is not cloud fully transparent (real alpha), no sky colour behind the clouds. SEAMLESS REPEAT RULE: every cloud stays at least 8% of the width away from the left and right edges, so both edges are fully transparent.` |
| mid (panel A) | `MID layer of <place> at <time>: a band of <rolling forested hills | rooftops | cliffs> seen from the side, <detail>; the top line varies between about 45% and 65% of the image height and the band fills everything below down to the bottom edge. <Mid values, lighter and softer than a foreground.> Wide landscape canvas; everything above the band fully transparent (real alpha), no sky. SEAMLESS REPEAT RULE: in the outer 10% of the width on BOTH the left and right sides show only a low, smooth <hill shoulder> at the same height (about 62% down from the top), with nothing taller, so the left edge and the right edge can be joined; nothing tall crosses either edge.` |
| near (panel A) | `NEAR layer of <place> at <time>: dark, near-black <colour> silhouettes of <a few tall shapes, low shapes> standing on a continuous dark ground strip along the very bottom edge; a thin rim light on their tops; most shapes sit in the lower 35% of the image and only the tallest reach about halfway up. Groups with open gaps between them, not a solid wall. Wide landscape canvas; everything above and between the silhouettes fully transparent (real alpha). SEAMLESS REPEAT RULE: in the outer 10% of the width on BOTH sides show only the dark ground strip with low <plants> at the same height, nothing tall crossing either edge.` |
| under (A and B, one call each, same run) | pass near panel A FIRST and the key SECOND. `UNDER layer of <place> at <time>, the part of the near layer that continues BELOW its ground line: an opaque band of <dark forest floor: roots, stones half sunk in soil, undergrowth> seen strictly from the side, with a faint rim light only along the very top edge. The TOP 10% of the image is the same <near-black> ground strip as the bottom edge of the FIRST attached image (same colour and value) so the two join; below it the band gets slowly darker towards the bottom edge, never black. Even texture across the whole width, no single large feature, no trees, no sky. Wide landscape canvas, fully opaque, filled edge to edge. SEAMLESS REPEAT RULE: the left and right edges continue into each other: same ground line height and texture density at both edges.` (B adds: `A different stretch of the same bank: other roots, other stones in other places.`) |

**Panel B** (mid and near): pass panel A FIRST and the key SECOND in `referenced_image_paths`, and replace the opening sentence with:

```
Match the FIRST attached image (panel A of the same parallax layer) exactly in rendering, value, colour, scale and height of the ground line and rim light; the second attached image is the style key painting. Draw panel B: a NEW stretch of the same layer with a different arrangement of shapes, so that panels A and B can alternate side by side without a visible join. Do not copy panel A's layout.
```

Then name panel B's groups explicitly, left to right, so it cannot copy A (near example: `a single leaning tree with a fallen log; a wide bed of low plants with no trees; a cluster of three small young trees of different heights; one large flat-topped boulder; a broken stump. Uneven spacing.`). Without that list the tool tends to repeat panel A's group, and the strip shows the same group every screen.

**Another time of day** (optional): first edit the key (`Edit the referenced image: change ONLY the time of day to <night ...>; keep the composition ...`), then edit each layer with the layer FIRST and the new key SECOND: `Edit the FIRST referenced image (<which layer>): change ONLY the time of day, matching the light and colours of the SECOND referenced image. Keep every shape, its position and outline exactly, the canvas size and <the transparent background>.` Put a `TIME OF DAY (overrides only the light and palette words of the style lock below): ...` paragraph before the lock.

## 4. Post-process (`tools/postproc.py`, Python + Pillow) and the manifest

Stored height = the view height × 1.5 (a 640×360 view: 540 px). The module scales each layer to the view height once and draws it 1:1 at whole device pixels.

| layer | `post` chain in `assets.json` | entry fields |
|---|---|---|
| far | `[{"resize": {"h": 540}}, {"seam": {"mode": "hrepeat"}}, {"export": {"quality": 86}}]` | `"alpha": false` |
| clouds | `[{"resize": {"h": 540}}, {"alpha": {"defringe": 2}}, {"seam": {"mode": "hrepeat", "search": 0, "blend": 8}}, {"export": {"quality": 84}}]` | `"softAlpha": true` |
| mid, near | `[{"resize": {"h": 540}}, {"join": {"blend": 96}}, {"alpha": {"defringe": 2}}, {"export": {"quality": 86}}]` | `"source": {"run", "file", "also": [{"run", "file"}]}` (panel A in `source`, panel B in `also`) |
| under | `[{"resize": {"h": 270}}, {"join": {"blend": 64}}, "opaque", {"export": {"quality": 84}}]` (height = view height × 0.5 × 1.5) | `"alpha": false`, `"hFrac": 0.5` (drawn half the view tall), `"overlap": 0.04` (how much the near ground strip covers its top), A in `source`, B in `also` |

Every layer entry: `"role": "bg-layer"`, `"key": "<set>-<layer>"` (e.g. `dusk-mid`), `"set"`, `"layer"`, `"seam": "hrepeat"`, `"file": "<set>/<layer>.webp"`, `"prompt": [PROMPT/GEN files of every run used]`, and on the far layer `"haze": "#rrggbb"` (the colour of its mist band: the depth tint mixes it into far layers). `postproc.py build assets.json` fills sizes, sha256, panel `joins` and `seamScore`; `assetcheck.py assets.json` must print `"ok": true` (seam ≤ 1.5 at every wrap, real alpha with clear top corners, provenance).

`seam` (hrepeat) and `join` cut both ends where they match best (a few dozen px) and cross-fade 1/8 of the width, premultiplied, so a transparent sky never leaks its hidden colour. Look at the result with `postproc.py roll IN OUT` (puts the wrap in the middle) or `hstrip IN OUT --n 3 --matte #808080`.

If a join shows a ghosted half-transparent tree, the panel broke the SEAMLESS REPEAT RULE: regenerate that panel; never repaint it with code.
