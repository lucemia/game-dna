Defaults: {{cards}} = one per upgrade in the game's G-07 table (at most 12; upgrades that do the same thing may share one) · {{style}} = modern hand-painted 2D card illustration · {{light}} = TOP-LEFT

Give my game's upgrade cards painted illustrations, made for this game. Use the files that came with this prompt: `card-art.js` (global `GameDNA_CardArt`, with `card-art.README.md`), `TEMPLATES.md` (style lock, key card, other cards, manifest entry, checks) and `tools/` (`namecheck.py`, `cardset.py`, `postproc.py`, `assetcheck.py`, README). Include `card-art.js` verbatim; do not rewrite it.

The cards are the G-07 upgrade draft (`upgrade-draft.js`, global `GameDNA_UpgradeDraft`). If the game does not have it yet, add it first exactly as its own section says, then continue here. Do not change `upgrade-draft.js` either, and do not clear the game's held movement keys when the draft opens or closes.

**Rules.** Generate images only with your built-in image tool (image_gen), one image per call, `transparent_background: false`. Never draw or retouch an image with code; scripts only crop, resize, export and check. Generate now, once; the game never calls a generator. No names of real games, franchises, characters, brands, studios or living artists in any prompt, no "in the style of <Name>"; every prompt ends with the guard sentence "Original, no resemblance to any existing game, film or franchise character, no text, no logo, no watermark."; run `python3 tools/namecheck.py --require-guard <prompt file>` before sending it.

**1. Read the game.** Theme, palette and setting (sky, ground, UI colours); the upgrade table (names, texts, tags); the `draft.draw(` call(s); the boot (first step, the `?t=` fast-forward loop, the first animation frame); restart.

**2. Plan the set.** {{cards}}: write one subject per card, an object or tiny scene that shows what the upgrade does (a shield for defence, boots for speed), with 2-3 concrete details and an accent colour. Write the STYLE LOCK paragraph from TEMPLATES.md §1 ({{style}}, light from the {{light}}, palette and setting words from the game) and save it as `art/style-lock.txt`.

**3. Generate.** The key card (TEMPLATES.md §2) with NO reference; check it (2:3 portrait, the whole subject inside the upper safe area, calm dark lower half, no letters, no border) and regenerate if wrong. Then every other card (§3) passing the key card's absolute path in `referenced_image_paths`. Save each image unchanged in `art/gen/<run name>/` with a GEN.md (§4).

**4. Post-process and check.** Write `art/assets.json` (§5): one `role: "card"` entry per image, key = the art key your upgrades will use. Run `tools/cardset.py build art/assets.json`, then `tools/cardset.py check art/assets.json` and `tools/assetcheck.py art/assets.json` until both print `"ok": true` (provenance may stay red; the runner verifies it). Regenerate a card that fails; never fix pixels with code.

**5. Wire it in.**
- Give each upgrade `art: '<its key>'` (never change names, texts, rarities, deltas or the draw).
- After `upgrade-draft.js` load `card-art.js`; next to the draft: `const cardArt = GameDNA_CardArt.create({art: {<key>: 'art/cards/<key>.webp', …}, upgrades: <the same table>})` (a new top-level name: grep it first).
- Replace every `draft.draw(ctx…)` with `cardArt.drawDraft(ctx, draft…)`: same place, same arguments after `ctx`.
- Replace the old boot call with `cardArt.onReady(boot)`, `boot` = the old start code unchanged.

**Self-check without a browser.**
- Both modules byte-identical, loaded before the game script; no `draft.draw(` left; the old boot, `requestAnimationFrame` and the `?t=` loop run once, from `onReady`, so `?t=<ms>&freeze=1` is deterministic and `?auto=1` ends as before.
- Every upgrade's `art` key has a file in `art/cards/` and an entry in `art/assets.json`.
- `art/checks.json` holds the `cardset.py check`, `assetcheck.py` and `namecheck.py` results.

Finish with CHANGES.md: the style lock, each card's subject and which upgrade uses it, the files, and a `?t=` moment with a draft open.
