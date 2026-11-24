Defaults: {{assets}} = character, prop, ground tile, icon · {{style}} = modern hand-painted 2D game art · {{light}} = TOP-LEFT · {{scale}} = 2 for an HD canvas, 1 for a fixed low-resolution canvas

Give my game generated bitmap art that all looks made by one hand, by locking an art direction first. Files given: `art-direction-lock.js` (global `GameDNA_Assets`, with README), `TEMPLATES.md` (prompt templates, post-process recipes) and `tools/` (`namecheck.py`, `postproc.py`, `assetcheck.py`, README). Include `art-direction-lock.js` verbatim; do not rewrite it.

**Rules.** Generate images only with your built-in image tool (image_gen). Never draw or repaint an asset with code; scripts may only trim, resize, clean alpha and export. Generation happens now, once: the game must never call a generator. No names of real games, franchises, characters, brands, studios or living artists in any prompt, and no "in the style of <Name>"; run `python3 tools/namecheck.py --require-guard <prompt file>` on every prompt before sending it. Every prompt ends with the originality guard sentence from the templates.

**1. Read the game.** Find its theme, camera (side view or top-down), canvas size, and every place that draws the hero, one world prop, the floor and one item or HUD icon: note each drawn size in canvas pixels and where its feet stand. New sprites keep the host's own sprite size, not a smaller figure.

**2. Lock.** Write one STYLE LOCK paragraph for this game ({{style}}, light from the {{light}}, the game's camera, outline, 4–6 palette words, proportions) and save it as `art/style-lock.txt`. Generate ONE reference sheet (sheet template, transparent background): hero, signature prop, floor patch, item. Save it unchanged as `art/gen/sheet/sheet.png` with `GEN.md` beside it (exact prompt sent, tool output, original path). Redo it if it has text or touching items.

**3. Derive.** Generate {{assets}} with the derived-asset template, passing the sheet's absolute path in `referenced_image_paths` on every call, the STYLE LOCK paragraph at the end of every prompt, `transparent_background` false only for the tile. Save the untouched PNGs in `art/gen/derived/` with their own GEN.md.

**4. Post-process and check.** Write `art/assets.json` (format in `tools/README.md`), one entry per shipped file: `role`, `file`, `source` {run, file}, `prompt` [PROMPT/GEN files], `post` chain from the recipes, `anchor`/`drawH` for sprites, `seam: "tile"` and `alpha: false` for the tile. Size every file to its drawn size × {{scale}}. Run `postproc.py build art/assets.json`, then `assetcheck.py art/assets.json` until it prints `"ok": true` (only provenance may stay red until the run is verified). Use `uv run --with pillow python …`, or `./.venv/bin/python` if uv cannot download.

**5. Wire it in.** Load the art once at boot (3-line pattern, module README): inline the manifest (or a list of `{key, src}`) in the page, call `GameDNA_Assets.load(list, {onReady: boot})` where `boot` is the game's old start code (first step, the `?t=` fast-forward, the first animation frame), and replace each drawing with `if (!GameDNA_Assets.draw(ctx, key, footX, footY, {h})) oldDraw()`. Fill the whole visible floor with ONE `fillTiled` call aligned to the camera, before props and under every tile type that showed floor (rocks, flowers): one call per cell leaves hairline seams. Keep every hit box, rule and timer; images change pictures only.

**Self-check without a browser.**
- Search every caller of the old boot, `requestAnimationFrame` and the `?t=` loop: they now run once, from `onReady`, so `?t=<ms>&freeze=1` renders one deterministic frame and `?auto=1` still finishes.
- Every new draw keeps the old drawing as fallback; restart does not reload images.
- Feet: the point passed to `draw` is the bottom centre of the old sprite.
- `assetcheck.py` output and `namecheck.py` results are saved in `art/checks.json`.

Finish with CHANGES.md: what you generated, what each image replaced, how to see it.
