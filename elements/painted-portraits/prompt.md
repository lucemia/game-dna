Defaults: {{characters}} = the 2 characters who speak most · {{expressions}} = happy, angry, sad, surprised, blink · {{style}} = modern hand-painted 2D character portrait · {{light}} = TOP-LEFT

Give the characters who talk in my game painted dialogue portraits with expressions. Use the files that came with this prompt: `painted-portraits.js` (global `GameDNA_PaintedPortraits`, with its README), `TEMPLATES.md` (templates, expression phrases, manifest entry) and `tools/` (`namecheck.py`, `portraitset.py`, `postproc.py`, `assetcheck.py`, README). Include `painted-portraits.js` verbatim; do not rewrite it.

**Rules.** Generate images only with your built-in image tool (image_gen), one image per call, `transparent_background: true`. Never draw or retouch an image with code; scripts only align, crop, resize, clean alpha and export. Generate now, once; the game never calls a generator. No names of real games, franchises, characters, brands, studios or living artists in any prompt, no "in the style of <Name>"; every prompt ends with the guard sentence "Original, no resemblance to any existing game, film or franchise character, no text, no logo, no watermark."; run `python3 tools/namecheck.py --require-guard <prompt file>` before sending it.

**1. Read the game.** Theme, canvas size, the speakers (names, roles, gender and age as the game shows them) and their lines, the function that opens dialogue and every caller, where the text box is drawn (its rect) and where the line advances, the boot (first step, `?t=` fast-forward, first animation frame), the fixed update step and restart.

**2. Lock and bases.** Pick {{characters}} (portraits must match each speaker's look); write one STYLE LOCK paragraph from the template ({{style}}, light from the {{light}}, palette words from the game) and save it as `art/style-lock.txt`. Generate the first character's neutral base with NO reference; then each other base passing the FIRST base's absolute path in `referenced_image_paths`. Regenerate any with text, a frame or a cropped head.

**3. Expressions as edits.** For each character, generate {{expressions}} with the edit template, passing ONLY that character's own neutral base in `referenced_image_paths`. Save every image unchanged in `art/gen/<run name>/` with a GEN.md giving, per file, the exact prompt, reference paths and tool output.

**4. Post-process and check.** Write `art/assets.json` (format and entry in TEMPLATES.md §5): one entry per file with `role: "portrait"`, `set`, `expr`, `source` {run, file}, `prompt` [GEN.md], the `portraitset` post chain, `setBase: true` on each neutral; stored height about 2× the drawn bust height. Run `tools/portraitset.py build art/assets.json`, then `tools/assetcheck.py art/assets.json` until it prints `"ok": true` (provenance may stay red until verified afterwards; `portrait-set` must pass: regenerate an edit that changed clothes or framing). Use `./.venv/bin/python` if uv cannot download.

**5. Wire it in** (module README, integration section): `por = GameDNA_PaintedPortraits.create({bounds: <the field the text box uses>, cast: {'<speaker name>': {src: 'art/cast/<id>-{expr}.webp', exprs: [...files you made], side}}, uiRects})`; give each spoken line an `expr` that fits its words (never change the text); with the H-01 dialogue box pass `onLine` and `bounds: () => por.reserve(field)` and `attach(dlg)`; with the game's own box `attach({rect: () => boxRectOrNull})` and call `por.onLine({speaker, expr})` wherever a line is shown. `por.update(1000 / 60)` in the fixed step (box-open branch too), `por.draw(ctx)` right after the box, `por.clear()` on restart, and replace the boot call with `por.onReady(boot)`.

**Self-check without a browser.**
- The old boot, `requestAnimationFrame` and the `?t=` loop run once, from `onReady`; `?t=<ms>&freeze=1` is deterministic and `?auto=1` ends the same way.
- Every place a line is shown calls `por.onLine` with its speaker and `expr`; closing the box makes `rect()` null.
- `art/checks.json` holds the `assetcheck.py` output and the `namecheck.py` results.

Finish with CHANGES.md: the characters, prompts and files you generated, which speaker uses which set, each line's `expr`, and a `?t=` moment that shows a portrait.
