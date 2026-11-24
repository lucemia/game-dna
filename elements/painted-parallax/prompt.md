Defaults: {{place}} = the game's own setting, read from its title, text and colours · {{time}} = dusk · {{layers}} = far, clouds, mid (2 panels), near (2 panels), under (2 panels) · {{scale}} = 1.5 (stored height = view height × 1.5)

Replace my game's flat background with painted parallax layers generated now in one locked style. Files given: `painted-parallax.js` (global `GameDNA_PaintedParallax`) and `art-direction-lock.js` (global `GameDNA_Assets`, the loader), each with a README; `TEMPLATES.md`; `tools/` (`namecheck.py`, `postproc.py`, `assetcheck.py`, README). Include both scripts verbatim.

**Rules.** Generate images only with your built-in image_gen, one call per image. Never draw or repaint a layer with code; scripts only resize, join, cross-fade, clean alpha and export. The game never calls a generator. No real game, franchise, character, brand, studio or living-artist names; every prompt ends with the lock paragraph, whose last sentence is the guard "Original, no resemblance to any existing game, film or franchise character, no text, no logo, no watermark."; run `python3 tools/namecheck.py --require-guard <file>` on each before sending.

**1. Read the game.** Find the view size, each old background function and its scroll speed, the camera variables, where the ground starts on screen, and every screen that draws the background.

**2. Lock.** Write one STYLE LOCK paragraph for {{place}} at {{time}} with the template (strict side view, light from behind the far plane, no left-to-right gradient) and save it as `art/style-lock.txt`. Generate ONE style key painting (opaque, no reference). Keep it in `art/gen/key/` with GEN.md.

**3. Layers.** Generate {{layers}} with the layer templates: the key's absolute path in `referenced_image_paths` on every call, the STYLE LOCK paragraph at the end, each layer's SEAMLESS REPEAT RULE. Panel B of mid and near passes panel A first and the key second, with a deliberately different arrangement. The opaque under strip (the forest floor below the near layer's ground, shown when the game's ground is higher than the painted one) passes near panel A first. Save untouched PNGs, one folder per call under `art/gen/`, each with GEN.md.

**4. Post-process and check.** Write `art/assets.json` (TEMPLATES.md §4): one `bg-layer` entry per layer with `key` `<set>-<layer>`, `set`, `layer`, `source` (panel B in `source.also`), `prompt`, the `post` chain from the recipes with height = view height × {{scale}}, `seam: "hrepeat"`, `alpha: false` for far, `softAlpha: true` for clouds, `haze` on far. Run `postproc.py build art/assets.json`, then `assetcheck.py art/assets.json` until it prints `"ok": true` (provenance may stay red until verified afterwards). Regenerate a panel that shows a ghosted shape at a join (`postproc.py roll`). Python: `./.venv/bin/python`.

**5. Wire in.** Inline the manifest's entries in the page (no `fetch`), load them with `GameDNA_Assets.load(PACK, {base: 'art/', onReady})`, and in `onReady` create the backdrop once (`view`, `set`, `params: {ground, vertical, restY}` from step 1, `fallback` = the old layer functions), then run the game's old boot unchanged. Replace the old background call with `if (!bg || !bg.draw(ctx, camX, camY)) oldBackground()`, first in the draw pass, outside any camera translate, on every screen that drew it. Call `bg.update(stepMs)` in the fixed step. If the old background moved with camera y, set `vertical: 0.5` and `restY` = the camera y at the start. Keep every rule and timer.

**Self-check without a browser.**
- The boot runs once, from `onReady`, so `?t=<ms>&freeze=1` renders one deterministic frame and `?auto=1` still finishes; nothing uses wall-clock time for the backdrop.
- The camera numbers passed to `draw` are the ones the tiles use; `ground` worked example: 360-high view, ground at y 312 → 0.87.
- Save assetcheck and namecheck output in `art/checks.json`.

Finish with CHANGES.md: style lock, prompts, file sizes, what each layer replaced, how to see it.
