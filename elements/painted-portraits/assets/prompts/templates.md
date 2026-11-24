# Prompt templates: painted portrait sets (L-02)

Fill every `<...>`. Keep every sentence that says original / no text / no logo / no watermark: `namecheck.py --require-guard` refuses a prompt without them, and refuses names of real games, franchises, characters, brands, studios and living artists, and "in the style of <Name>". Describe the look in plain words.

Use `transparent_background: true` on every call. One image per call. Save every result unchanged (byte-for-byte) with the file name given here.

## 1. Style lock (write once; paste unchanged at the end of EVERY prompt)

```
STYLE LOCK (identical in every prompt of this set): <medium, e.g. modern hand-painted 2D character portrait> for the dialogue scenes of an original <genre> game; <rendering, e.g. soft painterly brushwork over clean readable shapes, gentle colour transitions on the skin>; head-and-shoulders bust in three-quarter view, head and body turned slightly toward the viewer's right, eyes looking to the right; one key light from the <TOP-LEFT>, <light mood, e.g. warm golden highlights against cool violet-grey shadows>; <outline, e.g. a thin dark warm-brown outline>; <palette words that match the game>; framing: the top of the head about 6 percent below the top edge of a square canvas, the eyes at about 36 percent of the height, the bust cut off flat at mid-chest by the bottom edge of the canvas, the figure centred horizontally; fully transparent background (real alpha), no backdrop, no frame, no vignette, no cast shadow. Original, no resemblance to any existing game, film or franchise character, no text, no logo, no watermark.
```

Keep the framing sentence as it is: every character then shares the same head size, eye line and flat cut, which is what lets the game stand them on the dialogue box.

Pick visual traits that are not a famous character's: change at least two of colour, outfit, silhouette and prop from the genre's best-known look (a young hero in a green tunic, a spiky-haired swordsman, a pointy-hat wizard with a long white beard read as copies). Vary ages, skin tones and builds across the cast.

## 2. First base (character 1, `<id>-neutral.png`, NO reference)

```
Bust portrait of an original character: <role and age>, <skin>, <hair>, <2-3 clothing or accessory details that fit the game's world>. Calm neutral expression, mouth closed, relaxed brows, eyes open looking to the right. Square canvas, fully transparent background (real alpha).

<STYLE LOCK>
```

Look at it before going on. Regenerate (new file name, keep the old one) if it has text, a frame, a backdrop, a cropped head, or looks like a known character.

## 3. Other bases (`<id>-neutral.png`, reference = the FIRST base)

```
Match the attached reference portrait exactly in rendering: same brushwork, outline, light direction, colour temperature, camera angle, head size, framing and crop on the canvas (top of the head, eye line and the flat cut at mid-chest in the same places). Do not copy the person, hair or clothing: draw only the new character described here. Bust portrait of an original character: <role and age>, <skin>, <hair>, <2-3 details>. Calm neutral expression, mouth closed, relaxed brows, eyes open looking to the right. Square canvas, fully transparent background (real alpha).

<STYLE LOCK>
```

## 4. Expression edits (`<id>-<expr>.png`, reference = THAT character's own neutral base, nothing else)

```
Edit the referenced portrait: change ONLY the facial expression to <expression phrase>. Keep the identical person, face shape, skin, hair, every mark, clothing and accessories, the same head angle and gaze direction, the same pose, position, size and crop on the canvas (do not move, scale, rotate or re-frame the figure), the same light, palette and the fully transparent background (real alpha).

<STYLE LOCK>
```

| expr | expression phrase |
|---|---|
| `blink` | eyes fully closed in a natural, relaxed blink (upper lids down, lashes resting), with the same calm closed mouth and relaxed brows as the reference |
| `happy` | a warm, open smile showing a little of the upper teeth, cheeks lifted, eyes slightly narrowed with gentle smile lines |
| `angry` | angry: brows drawn down hard and together, eyes narrowed and fierce, nostrils slightly flared, jaw set, lips pressed into a hard line |
| `sad` | sad: inner ends of the brows raised and drawn together, eyelids lowered, gaze cast slightly down, mouth corners turned down |
| `surprised` | surprised: brows raised high, eyes wide open showing white around the irises, mouth dropped open in a small round shape |
| `determined` | determined and thoughtful: brows slightly lowered and focused, steady narrowed gaze, lips closed in a small firm line, chin slightly raised |

If an edit changed the clothes, zoom or position, regenerate that edit (same prompt, new file name); `assetcheck.py` reports it as `portrait-set` failed.

## 5. Post-process (`portraitset.py`, Python + Pillow)

One manifest entry per file in `assets.json` (format in `tools/README.md`; paths relative to the manifest):

```json
{"key": "<id>-<expr>", "role": "portrait", "set": "<id>", "expr": "<expr>", "file": "cast/<id>-<expr>.webp",
 "source": {"run": "gen/<run folder>", "file": "<id>-<expr>.png"},
 "prompt": ["gen/<run folder>/GEN.md"],
 "post": [{"portraitset": {"h": <stored height>, "margin": 0.03}}, {"alpha": {"defringe": 3}}, {"export": {"quality": 84}}],
 "alpha": true, "anchor": [0.5, 1], "facing": "right"}
```

Add `"setBase": true` on each neutral entry. Stored height = about 2× the height the game draws the bust at on an HD canvas (default drawn height = 46 % of the dialogue field: 166 px on 640×360 → store 336). Then:

```
python tools/portraitset.py build art/assets.json      # aligns every edit onto its base, one crop per set, alpha, WebP; fills w, h, bytes, sha256, align, crop
python tools/assetcheck.py art/assets.json             # must print "ok": true (provenance may stay red until the run is verified afterwards)
```

`portraitset.py build` never paints: it registers by silhouette (scale and shift), crops, resizes, cleans the alpha and exports. Keep the pack under ~600 KB.
