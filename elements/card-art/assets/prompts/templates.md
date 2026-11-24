# Prompt templates: card illustrations (L-07)

Fill every `<...>`. Keep every sentence that says original / no text / no logo / no watermark: `namecheck.py --require-guard` refuses a prompt without them, and refuses names of real games, franchises, characters, brands, studios and living artists, and "in the style of <Name>". Describe the look in plain words instead.

A card illustration is a **tall 2:3 painting, opaque, full-bleed, with no text**. The card frame (title, cost, rules text) is drawn by code over its lower part, so every illustration keeps the same **safe area**: the subject centred at about 28 % of the height, inside x 15-85 % and y 4-55 %; the lower 45 % calm, darker background; nothing important within 6 % of an edge. One light for the whole set: from the top-left.

## 1. Style lock paragraph (write once; paste unchanged at the end of EVERY prompt)

```
STYLE LOCK (identical in every prompt of this set): <medium, e.g. modern hand-painted 2D card illustration | clean cel-shaded card illustration | soft painterly card illustration> for an original <the game's genre and world in a few words>; <brushwork / rendering, e.g. soft painterly brushwork over clean readable shapes>; one hero object or tiny scene seen front-on, slightly from above, large and centred in the UPPER half of a tall portrait painting; one key light from the TOP-LEFT, <light mood, e.g. warm highlights against cool shadows>, a soft cool rim light on the right edge of the object; <outline, e.g. a thin dark warm-brown outline around the main object>; <palette: 4-6 colour words taken from the game's own colours>, plus ONE accent colour named in the brief; background: a soft atmospheric painted backdrop of the same world (<2-3 things from the game's setting>, mist, a little glow behind the object) that becomes darker, plainer and calmer toward the bottom, with no busy detail in the lower half; full-bleed painting edge to edge, no border, no frame, no card layout, no panel, no banner, no lettering. Original, no resemblance to any existing game, film or franchise character, no text, no logo, no watermark.
```

Take the palette and setting words from the game itself (its sky, ground, UI colours), so the cards belong to it. Pick subjects that are objects or tiny scenes (a sword, a shield, boots, a potion, a charm), not famous-looking characters.

## 2. Key card (1 image, `transparent_background: false`, NO reference)

```
Tall portrait card illustration in 2:3 portrait orientation (if the canvas comes out square, keep everything important inside the central two-thirds of the width and let the outer strips be plain background). Subject: <the first upgrade's object, 2-3 concrete details>. Accent colour: <one colour>. Framing: the subject fills about 60 percent of the painting's width, its centre at about 28 percent of the height from the top; the whole subject, including chains, cords, smoke, sparks and clouds, inside the upper safe area (never touching the top or side edges); nothing important in the lower 45 percent (dark misty ground there) and nothing important within 6 percent of any edge.

<STYLE LOCK paragraph>
```

Look at it before going on: wrong framing (subject low, cut, or a cord / chain / cloud running off the top edge), text or letters anywhere, a border or card layout painted in, or a busy lower half → generate it again. Never fix it with code.

## 3. Every other card (pass the key card's absolute path in `referenced_image_paths` on EVERY call)

```
Match the attached reference card illustration exactly in rendering and composition: same brushwork, outline weight and colour, light direction, palette, backdrop treatment (darker and calmer toward the bottom) and the same placement and size of the hero object in the upper half. Do not copy its object; paint only the new subject described here. Tall portrait card illustration in 2:3 portrait orientation (if the canvas comes out square, keep everything important inside the central two-thirds of the width and let the outer strips be plain background). Subject: <object, 2-3 details>. Accent colour: <colour>. Framing: the subject fills about 60 percent of the painting's width, its centre at about 28 percent of the height from the top; the whole subject, including chains, cords, smoke, sparks and clouds, inside the upper safe area (never touching the top or side edges); nothing important in the lower 45 percent and nothing important within 6 percent of any edge.

<STYLE LOCK paragraph>
```

One subject per upgrade (or per group of upgrades that do the same thing). Give each a different accent colour where you can, so a hand of three reads apart at a glance.

## 4. Record

Save every image unchanged in `art/gen/<run name>/` (e.g. `art/gen/key/`, `art/gen/set/`) with a `GEN.md` giving, per file: the exact prompt sent, `referenced_image_paths`, `transparent_background`, the tool's output path.

## 5. Manifest entry (`art/assets.json`, format `gamedna-assets/1`)

```json
{"format": "gamedna-assets/1", "pack": "<game> card art", "budgetBytes": 600000,
 "generated": {"tool": "codex image_gen.imagegen (built-in)", "date": "<YYYY-MM-DD>"},
 "styleLock": {"text": "style-lock.txt", "reference": "<key of the key card>"},
 "assets": [
  {"key": "<upgrade id or art key>", "role": "card", "file": "cards/<key>.webp", "alpha": false,
   "source": {"run": "gen/<run>", "file": "<file>.png"}, "prompt": ["gen/<run>/GEN.md"],
   "post": [{"crop23": {}}, {"resize": {"size": "360x540"}}, {"export": {"quality": 84}}]}
 ]}
```

Paths are relative to `art/`. 360x540 suits a 640x360 game on a 2x screen; keep the set under 600 KB.

## 6. Post-process and check

```sh
python3 tools/cardset.py build art/assets.json      # crop to exactly 2:3, resize, WebP, sha256 into the manifest
python3 tools/cardset.py check art/assets.json      # ratio, opaque, calm lower part, subject in the safe area, edges, light from the left, one exposure
python3 tools/assetcheck.py art/assets.json         # sizes, sha256, prompt names, budget (provenance is verified afterwards by the runner)
```

(Use `./.venv/bin/python` if it exists: it has Pillow.) A card that fails `calmBottom`, `subjectHigh` or `edges` is regenerated with the same prompt (it is a composition problem; cropping by code would cut the subject). `light` fails when the key light comes from the right: regenerate. `lumaSpread` names a card much darker or lighter than the rest: regenerate it with the key card as the reference.
