Defaults: {{subject}} = the character or prop the game draws most often (the hero if it is drawn at least 40 px tall) · {{ambient}} = from the scene (day 0.8 with `key` intensity 0.25: as bright as the game's world; dusk 0.5; night 0.3) · {{lights}} = a lantern on the hero plus every lamp, fire, glowing pickup or projectile the game draws

Make one painted sprite with a derived normal map for my game, lit by its lights. Files given: `normal-maps.js` (global `GameDNA_NormalMaps`) and `art-direction-lock.js` (global `GameDNA_Assets`, the loader), each with a README, `TEMPLATES.md` (templates, commands, light settings) and `tools/` (`normalmap.py`, `postproc.py`, `assetcheck.py`, `namecheck.py`). Include both `.js` files verbatim.

**Rules.** Generate pictures only with your built-in image tool (image_gen). Never draw or repaint art with code; scripts only crop, scale, clean alpha, export and derive the maps. Generate once; the game never calls a generator. No names of real games, franchises, characters, brands, studios or living artists in any prompt, no "in the style of <Name>"; run `python3 tools/namecheck.py --require-guard <prompt file>` on every prompt before sending it.

**1. Read the game.** Find its theme, camera, canvas size, the boot code (first step, `?t=` fast-forward, first frame), the draw function of {{subject}} with its feet point, height, facings (a back view when facing up?), hurt / blink effects and attack / equipment drawing (weapon, swing arc), and the light sources ({{lights}}).

**2. Lock and generate.** Write a STYLE LOCK paragraph (TEMPLATES section 1: even light, the game's camera and colours) to `art/style-lock.txt`. Generate {{subject}} with section 2 (transparent background, no reference, no floor patch or cast shadow). Save the untouched PNG and GEN.md in `art/gen/<run>/`. Retry (max 3) if it breaks section 2. If the old sprite has a back view, also generate one with the first picture in `referenced_image_paths` (section 2); use pictures for every facing, never the old body.

**3. Post-process and derive.** Write `art/assets.json` from section 3 (albedo entries + their `<key>-nh` normalmap entries), run `postproc.py build`, `normalmap.py build`, then `assetcheck.py art/assets.json` until `"ok": true` (provenance: checked afterwards). Use `uv run --with pillow python` or `./.venv/bin/python`.

**4. Wire it in.** Inline the entries (`src` relative to the page; keep `anchor`, `drawH`, `normal`), replace the old boot call with `GameDNA_Assets.load(list, {onReady: boot})` and create one instance at load time: `const nm = GameDNA_NormalMaps.create({assets: GameDNA_Assets, ambient: {{ambient}}, lights: () => gameLights()})`. `gameLights()` returns at most 8 `{x, y, z, radius, color, intensity}` in your draw coordinates, from game state only (flicker from the game clock, never `Date.now()` or `Math.random()`): each light where its source is drawn (a carried lantern at the painted lantern), visible sources only, not every coin or eye. Where {{subject}} was drawn: `if (!nm.draw(ctx, key, feetX, feetY, {h: oldHeight, flip})) oldDraw(...)` (`flip` mirrors). Hurt flash: pass `flash` 0..1 (whitens the new sprite's own silhouette); blink: `alpha`. Never draw the old body over or under the new one, but keep drawing the old weapon, swing arc and effects after `nm.draw` so attacks stay visible. Ambient, lights: TEMPLATES section 4.

**Self-check without a browser.**
- Boot, `requestAnimationFrame` and the `?t=` loop run once, from `onReady`; `?t=&freeze=1` deterministic; `?auto=1` finishes; restart keeps instance and images.
- Every `nm.draw` keeps its old-drawing fallback; no rule, hit box or input changed.
- Worked example: intensity 1.4 at half its radius adds about 0.7 x (0.15 + facing share) of the painted colour on the facing side.
- `assetcheck.py` and `namecheck.py` output saved in `art/checks.json`.

Finish with CHANGES.md: what you made and replaced, its lights, how to see it (serve over http; `file://` draws it unlit), `?normals=0`.
