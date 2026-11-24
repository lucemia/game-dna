# L-01 Painted parallax layers

## 1. What it is

The flat background of a side-view HD game (a sky gradient, a sine-wave hill, triangle trees) becomes 3–5 **hand-painted layers generated once at build time** with Codex `image_gen` in one locked style:

| role | file (sample pack) | alpha | scroll factor | what |
|---|---|---|---|---|
| far | `dusk/far.webp` 1418×540 | opaque | 0.16 | glowing sky, distant ridges, a mist band at the bottom |
| clouds | `dusk/clouds.webp` 712×360 | soft feathered alpha, clear edges | 0.08 + 6 px/s drift | four thin streaks in the upper 35 % (stored at 1x: soft) |
| mid | `dusk/mid.webp` 3048×540 | alpha | 0.48 | rolling forested hills with mist in the dips (two panels joined) |
| under | `dusk/under.webp` 1400×270 | opaque | 0.72 | forest floor below the near layer's ground line (roots, stones, ferns; two panels joined), drawn half the view tall right under the near ground strip when the game's ground is higher than the painted one |
| near | `dusk/near.webp` 2988×540 | alpha | 0.72 | dark pines, ferns, mossy boulders, a leaning pine and fallen log, a stump on a ground strip (two panels joined, panel B with a deliberately different arrangement) |

The roles and factors are those of I-02 parallax-layers (code-drawn pixel layers), so the two elements are interchangeable: I-02 for pixel games, L-01 for HD painted games (the basket treats them as one system, "backdrop": pick one; I-02 can serve as L-01's fallback).

How the art is made (the "regenerate" layer, `prompt.md` + `assets/prompts/templates.md`):
1. **Lock**: one STYLE LOCK paragraph (strict side view, light from BEHIND the far ridges so there is no left-to-right gradient that could never repeat, atmospheric perspective, palette) and one **style key painting** of the whole place (all planes together, opaque, no reference).
2. **Layers**: each layer prompt passes the key in `referenced_image_paths`, ends with the lock paragraph and carries a **SEAMLESS REPEAT RULE** (far: low skyline at both edges; clouds: clear of both edges; mid/near: the outer 10 % only a low shoulder / ground strip at the same height). Mid and near get a **panel B** made with panel A as the first reference ("a new stretch of the same layer").
3. **Post-process** (`tools/assets/postproc.py`): resize to view height × 1.5; far: `seam --mode hrepeat`; mid/near: `join` (panel A + B); every join and wrap first **cuts both ends where they match best** (search W/16, smallest cut within 15 % of the best match), then **cross-fades** 1/8 of a panel, premultiplied so a transparent sky never leaks its hidden colour; `alpha` cleanup; WebP.
4. **Check**: `assetcheck.py` (seam ≤ 1.5 at every wrap, bg-layer alpha rule, provenance of every panel), `checks/seamcheck.py` on the running page.

Another time of day reuses the shapes: edit the key ("change ONLY the time of day"), then edit each layer with the layer first and the new key second. The sample ships dusk and night (Mistfall Highlands, 576 KB for both sets including two 480-px key paintings).

At runtime (`module/painted-parallax.js`, global `GameDNA_PaintedParallax`, loaded after L-00's `GameDNA_Assets`): each layer is scaled once to the view height × the context's device scale (capped at 2× the stored height) with its depth tint baked in, then drawn at whole device pixels, each repeat ending exactly where the next begins, repeated sideways and offset by `floor(camX × factor)`. A missing image calls the host's old drawing for that layer.

## 2. Default parameters

| param | default | range | note |
|---|---|---|---|
| `depth` | 1 | 0–1.5 | multiplies all factors (far 0.16, clouds 0.08, mid 0.48, near 0.72) |
| `tint` | 1 | 0–2 | haze share at 1: far 0.34, clouds 0.2, back 0.24, mid 0.14, near 0 |
| `haze` | auto | `#rrggbb` | auto = far entry's `haze` (dusk `#8a8cb8`, night `#2c3d5e`) |
| `drift` | 1 | 0–4 | clouds 6 px/s at 1 |
| `vertical` / `restY` / `maxShift` | 0 / 0 / 0.15 | | follow camera y around a rest position, clamped to ±15 % of the view |
| `ground` | 1 | 0.4–1 | lifts near (100 %), mid (75 %), far (25 %) so painted ground meets a high game ground; the under strip fills below the near layer: the near strip's bottom 12 px fade into it (no straight edge), and below ~0.55 it continues downwards, darker with depth, to the bottom of the view |
| `layers` | 4 | 3–4 | 3 = no clouds |
| `backing` | 0 (auto) | 0–4 | device scale from `ctx.getTransform()` |
| stored height | view h × 1.5 | | 540 px for a 640×360 view |

## 3. Variants

- **Dusk** (default) and **Night**: same shapes, edited time of day; `bg.setSet('night')`.
- **Three layers** (`layers: 3`): no clouds, for interiors seen through windows or small budgets.
- **Static backdrop** (`depth: 0`) for a side-view battle; clouds still drift.
- **Regenerated set** for the game's own theme: `prompt.md` (one key + 6 layer images, about 8–10 min of Codex).

## 4. Interface

Needs: L-00 `GameDNA_Assets` loaded first and the game's boot moved into its `onReady`; the camera x (and y) in world px; the fixed step for `update(dt)`; the draw slot of the old background (first, outside the camera translate); optionally the old layer functions as `fallback`.

Provides: the backdrop; `draw(ctx, camX, camY) → bool` (false = nothing painted, draw the old background); `drawLayer(ctx, role, …)`; `layers()` and `lastDrawn()` (offsets, factors, panel joins) for tests; `GameDNA_PaintedParallax.instances`; the manifest with prompt, GEN.md, model, date and sha256 per file; skin role `bg-layer` per entry (`skinRole`).

## 5. Screen rules

- Each layer covers the full view height; repeats are placed at whole device pixels with no gap or overlap; offsets use `floor`, so a camera moving forward never moves a layer backwards.
- Factors strictly grow front-wards: clouds 0.08 < far 0.16 < mid 0.48 < near 0.72.
- Joins: at every on-screen repeat and panel join the column step is ≤ 3 × the median step of the 48 px around it, or ≤ 6 grey levels (`seamcheck.py`); file wrap seam ≤ 1.5 × the neighbour difference (floor 1 grey level).
- Depth tint at 1: far gets 34 % haze, mid 14 %, near none: near silhouettes stay the darkest, highest-contrast layer and must still read behind the game's sprites (the near layer stays below about half the view height).
- Clouds drift 6 px/s at `drift: 1`; nothing else moves on its own.
- Budget: ≤ 600 KB for the shipped pack; layers stored at 1.5× the view height.
- Cost (headless Chromium): four layers 0.2 / 0.8 / 1.8 ms a frame at 640×360 / 1280×720 / 1920×1080 device px; the scaled, tinted copies are built once (18 / 80 / 180 ms for all four), again only after a set, parameter or canvas-size change.

## 6. Common mistakes (symptom → fix)

- Visible vertical line where a layer repeats → the image was not run through `seam` / `join`, or was drawn at a fractional scale per repeat; the module scales once and draws 1:1, so use it and the post chain.
- A ghosted half-transparent tree at a join → a panel broke the SEAMLESS REPEAT RULE; regenerate that panel (never repaint with code).
- Light brighter on one side, so the wrap shows a brightness jump → the lock put the sun on one side; light from behind the far plane.
- Layers do not move → `camX` passed as 0 or negated; pass the camera the tiles subtract.
- Backdrop painted over tiles → `draw` after the world translate; call it first.
- Old flat sky on frozen shots → boot ran before the images loaded; boot from `onReady`.
- Flat colour slab inside pits → the pack has no `under` layer (or it was left out of PACK); ship one (templates §3) or pass `fallback.under`.
- Same tree group every screen → panel B copied panel A; name B's groups explicitly in its prompt (templates §3).
- Painted backdrop behind pixel-art tiles looks like two games → L-01 is for HD games; use I-02 for pixel styles.

## 7. Acceptance moments

| moment | must be visible |
|---|---|
| `demo/?t=4200&freeze=1` | painted layers behind stone platforms (game ground at 0.8) and a traveller; a pit shows the painted under-strip; status shows 12/12 assets and factors 0.16 / 0.08 / 0.48 / 0.72 / 0.72 |
| `?ground=0.6` (dusk, night) | high game ground: the pits look into roots, ferns and stones, no flat slab |
| `?mode=split` | left half the old flat layers, right half painted; same camera |
| `?set=night` | same shapes, moonlit palette |
| `?seams=1&speed=300&t=12000` | join markers on screen with no visible line beneath them |
| `?tint=0` vs `?tint=2` | far ridges and mid hills sink into or out of the haze; near layer unchanged |
| section "The joins, magnified" | every repeat and panel join at 2x, join in the middle, nothing visible |
| host `?t=20000&freeze=1` (hd-sidescroll pack integration) | painted sky and hills behind the level; state identical to the original |
