Defaults: {{materials}} = chosen from the game's world · {{icons}} = 24 (6x4) · {{corner}} = about 1/12 of the canvas height · {{panel}} = a dark, 96 % opaque fill

Give my game a painted UI kit (frames, selection, slot, pointer, item icons) made by one hand, and use it in its windows and item lists. Use the files that came with this prompt: `painted-ui.js` (global `GameDNA_PaintedUI`, with its README), `art-direction-lock.js` (global `GameDNA_Assets`, the loader), `TEMPLATES.md` (prompt templates, post-process table) and `tools/` (`uikit.py`, `postproc.py`, `assetcheck.py`, `namecheck.py`). Include both `.js` files verbatim.

**Rules.** Generate images only with your built-in image tool (image_gen). Never draw or repaint art with code; scripts only crop, scale, clean alpha and export. Generate now, once: the game never calls a generator. No names of real games, franchises, characters, brands, studios or living artists in any prompt, no "in the style of <Name>"; run `python3 tools/namecheck.py --require-guard <prompt file>` on every prompt before sending it. No letters, numbers or words in any image.

**1. Read the game.** Find its theme, canvas size, every window or panel draw, every item and status it shows, the selected-row highlight and `>` pointer, and the boot code (first step, `?t=` fast-forward, first animation frame).

**2. Lock.** Write one STYLE LOCK paragraph for this game with {{materials}} (template 1) and save it as `art/style-lock.txt`. Generate the window frame with template 2 and keep it unchanged as `art/gen/lock/frame-window.png` with `art/gen/lock/GEN.md` (exact prompt, tool output, original path). Regenerate it if corners differ, edges are not plain or the inside is not empty.

**3. Derive.** With the frame's absolute path in `referenced_image_paths` on every call, generate `frame-small`, `select-frame`, `slot`, `cursor` (section 3) and one icon sheet of {{icons}} icons naming THIS game's items and status effects (section 4). Save the untouched PNGs in `art/gen/derived/` with their own GEN.md.

**4. Post-process and check.** Run the `uikit.py` commands from section 5 into `art/kit/`, write `art/assets.json` (format in `tools/README.md`, fields from section 5; `source` {run, file}, `prompt` [GEN files]; `corner` = {{corner}} for the window frame). Run `assetcheck.py art/assets.json` until `"ok": true` (provenance may stay red until the run is verified afterwards). Use `uv run --with pillow python …` (or `./.venv/bin/python`).

**5. Wire it in.** Inline the manifest entries as a list (`src` relative to the page, keep `slice`, `inset`, `corner`, `fill`, `panelInset`, `anchor`, `drawH`, `atlas`), replace the old boot call with `GameDNA_Assets.load(list, {onReady: boot})`, and create `const ui = GameDNA_PaintedUI.create({assets: GameDNA_Assets, panel: {{panel}}})`. Then, at every call site:
- panels: `if (!ui.frame(ctx, rect, {variant: 'window'})) oldPanel(...)`; tooltips, buttons, HUD and quest boxes use `'small'` (frame them all). Every text line must sit inside the rect `ui.frame` / `ui.inner(rect)` returns (past the corner ornaments): otherwise grow the frame rect outward and keep the text where it was (the fallback keeps the old rect). Hide a HUD panel only while a window covers it.
- items: a map from each item id to an icon key; `if (!ui.icon(ctx, key, x, y, size)) oldShape(...)` in the old shape's box.
- selected row or slot: `ui.select(ctx, rect, t)` with `t` = the game's own clock in seconds (frame count / 60), never `Date.now()`; pointer: `ui.cursor(ctx, tipX, tipY, h)`, tip left of the selected rect; both with the old drawing as fallback.

**Self-check without a browser.**
- Boot, `requestAnimationFrame` and the `?t=` loop run once, from `onReady`; `?t=&freeze=1` stays deterministic; `?auto=1` finishes.
- Every `ui.` call keeps its old-drawing fallback; no rule, menu or input changed.
- `assetcheck.py` and `namecheck.py` output saved in `art/checks.json`.

Finish with CHANGES.md: what you made, what it replaced, how to see it.
