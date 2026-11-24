# Add Painted parallax layers and Art-direction lock to my game

Add the 2 game elements below to MY existing game, which you have not seen. Each is a finished module file given with this prompt:

- `painted-parallax.js` (one global, `GameDNA_PaintedParallax`), API reference `painted-parallax.README.md`
- `art-direction-lock.js` (one global, `GameDNA_Assets`), API reference `art-direction-lock.README.md`

README example names are placeholders.

## Shared premises

1. **Include each module file verbatim; never edit it.** Load it with its own `<script src>` before the game's script, or paste it unchanged into its own `<script>` tag. If a module seems to need a change, adapt my game around it and tell me.
2. **Resolution:** keep my game's native resolution and integer scaling as they are. Call module draw functions on my 2D context inside the same transform as my sprites (one module pixel = one game pixel), and keep my game's own image-smoothing setting (off for pixel art, on for smooth or HD games; never switch it).
3. **Time:** drive every module from one fixed 60 Hz step (1000 / 60 ms). If my loop uses variable delta time, accumulate it and run whole steps (at most 250 ms per frame).
4. **Coordinates:** native screen pixels (world minus camera) unless a section says tiles.
5. **Art and names:** anything new you draw or name is original (no real game, character, place or brand names); English UI text; do not restyle my game.
6. **Hook, don't replace:** add calls or change bodies; never delete or rename a function.
7. **Keep every other caller working.** Find every caller and reader of what you change (turn order, input, moves, menus, HUD): autopilot/AI, test hooks, URL parameters such as `?auto=1`, `?t=` and `?freeze=1`, keyboard shortcuts, end-turn buttons. Update each one. My game's own autoplay must still finish a whole game. Keep existing HUD info (HP bars, max HP) and existing commands.

## Order of work

1. **Read the game first.** Write down (file, function) where these live: loop/update step; draw pass and its order (background, actors, effects, HUD); input; where damage/HP changes are applied; where turns, actions or selections are chosen and played; HUD windows and their rects; camera; battle/scene start and end; and every caller from premise 7.
2. **Check the prerequisites** below against those notes. If one is missing, add the smallest working version and tell me.
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Painted parallax layers [backdrop], (2) Art-direction lock [foundations].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Painted parallax layers:** GameDNA_Assets (Art-direction lock loader) loaded first; the game's boot moved into its onReady callback; a camera offset; a fixed 60 Hz update step; a draw slot between ground and units.
- **Art-direction lock:** the game's boot function (first step, ?t= fast-forward, first animation frame), moved into the onReady callback; each draw site to replace: hero, props, floor, item icons, with its drawn size and foot point in canvas px; optional: skins/skin-api.js v0.5 to route tile / prop / frame / icon / portrait / bg-layer roles.

## Element 1: Painted parallax layers (`painted-parallax.js`, `GameDNA_PaintedParallax`)

Draws the background of a side-view game from 3-4 painted bitmaps (far sky and ridges, drifting clouds, mid hills, near silhouettes) generated once at build time in one locked style. Each layer is scaled once to the view height with an atmospheric tint baked in, repeated sideways at whole device pixels without a visible join, and scrolled at its own fraction of the camera (clouds 0.08, far 0.16, mid 0.48, near 0.72, the Multi-layer parallax backdrop factors). A missing image falls back to the game's old layer.

**Parameters chosen:** `set` = dusk, `depth` = 1, `drift` = 1, `tint` = 1, `ground` = 0.8. (`mode`, `speed`, `layers`, `seams`: not used; your game keeps its own.)

**Where it goes** (by role; find these places in my game):

1. *The game's boot (first step, `?t=` fast-forward, first animation frame). Grep every caller:* Move it into `GameDNA_Assets.load(PACK, {base: 'art/', onReady})` (Art-direction lock). In `onReady`: `bg = GameDNA_PaintedParallax.create({view, set, params, fallback})` once, then the old boot unchanged. `PACK` = the bg-layer entries of assets.json inlined in the page (no fetch on file://).
2. *The function that draws the old background (sky gradient, hills, trees) and each layer's scroll speed:* First line of that function: `if (bg && bg.draw(ctx, camX, camY)) return;` (camX/camY = the camera the tiles use, not negated). Keep the old body: it is the fallback. Map old layer functions in `fallback: {far, mid, near}`.
3. *The fixed step (the one `?t=` fast-forward runs):* `if (bg) bg.update(STEP_MS);` (cloud drift; never wall-clock).
4. *Camera y (if the old background moved with it):* `params: {vertical: 0.5, restY: <camera y at the start>}`; layers shift at most 15 % of the view.
5. *Where the ground starts on screen:* `params: {ground: groundTopY / viewH}` (e.g. 232/360 = 0.64): the near layer's ground line then meets the game's, and the pack's `under` strip (keep the `<set>-under` entries in PACK) fills pits and gaps with painted forest floor. Leave 1 only when the ground is at the bottom of the view.
6. *devicePixelRatio canvases (`setTransform(scale)`):* Nothing to do: the module reads the transform and draws at device resolution. Pass `view` in the game's own units (e.g. 640x360).

**Common mistakes** (symptom -> fix):

- Layers frozen in place while the hero runs -> camX passed as 0 or as the negated offset; pass the same camera x the tiles subtract.
- Backdrop missing on the title or end screen -> that screen called the old background directly; route it through the same function.
- Clouds never move -> `update` not in the fixed step (or only in rAF, which `?t=` fast-forward skips).
- A frozen shot has the old flat sky -> boot runs before `onReady`; images are not loaded yet on the first frame.
- Layers drawn over tiles -> `bg.draw` called after the world translate; call it first, before `ctx.translate(-camX, ...)`.
- A flat colour slab inside pits -> the `under` entries were left out of PACK (or a regenerated set has no under strip); add them, or pass `fallback.under`.
- Painted layers next to pixel-art tiles look mixed -> Painted parallax layers targets HD games; for pixel games use Multi-layer parallax backdrop parallax-layers.

## Element 2: Art-direction lock (`art-direction-lock.js`, `GameDNA_Assets`)

Loads a set of pre-generated bitmaps (one locked art direction: every image was made with the same style paragraph and the same reference sheet) once at boot, then draws them synchronously in place of the game's code-drawn hero, props, floor and item icons, falling back to the old drawing when a file is missing. The game never calls an image generator, so `?t=&freeze=1` and `?auto=1` stay deterministic.

**Where it goes** (by role; find these places in my game):

1. *The game's boot (the code that runs the first step, the `?t=` fast-forward and the first animation frame). Grep every caller:* Wrap it as `boot()` unchanged and call `GameDNA_Assets.load(ASSET_LIST, {onReady: boot})` instead. `ASSET_LIST` is inlined in the page (a `file://` page cannot fetch `assets.json`): `[{key, src, anchor, drawH, tileW, tileH}]`, `src` relative to the page.
2. *Each draw site you replace (hero / NPC sprite, world props, floor, item or HUD icon):* `if (!GameDNA_Assets.draw(ctx, key, footX, footY, {h: <drawn height>, flip})) <old drawing>`. The anchor is the feet (bottom centre): pass the old sprite's top + height, not its top-left. Keep the old sprite's drawn height. Floor: ONE `GameDNA_Assets.fillTiled(ctx, key, viewRect, {tileW, tileH, ox: -camX, oy: -camY})` over the view, under every floor-like tile. Icons: `draw(..., {h: slot, anchor: [0.5, 0.5]})`.
3. *Depth sort:* Keep the game's own back-to-front order by foot y; the bitmap uses the same foot point as the old sprite.
4. *Low-resolution canvases (pixel games):* Draw at the drawn size with `imageSmoothingEnabled = true` set only around these calls (the game's own pixel art keeps it off). Generated art targets HD styles; on pixel games it looks painted, not pixel.
5. *Skins (only if skins/skin-api.js v0.5 is in the game):* `GameDNA_Skin.bitmaps.useAssets(GameDNA_Assets, {'tile:grass': 'ground', 'prop:well': 'well'})` after ready; `skin.tile()` / `skin.prop()` / `skin.frame()` then draw them.

**Common mistakes** (symptom -> fix):

- A frozen screenshot has no art, or differs between runs -> the old boot still runs directly; it must run only from `onReady`.
- Sprites float or sink -> the foot point passed was the old top-left; pass bottom centre.
- Images blurry-then-sharp or reloaded on restart -> `load` called in new game / restart; call it once at page load.
- Collision or hit boxes changed -> a rule read the image size; keep every size and box from the old code.
- A grey fringe around sprites -> the files were resized without `postproc.py alpha` (pack files are already clean; regenerate runs must post-process).
- Grid lines in the floor -> one `fillTiled` per cell (use one call), no `fillTiled` at all, or lossy WebP below 95.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Painted parallax layers] Scrolling right: far, mid and near move at clearly different speeds, clouds drift on their own; no vertical line, gap or jump where a layer repeats (`checks/seamcheck.py PAGE` passes).
- [Painted parallax layers] `?t=<ms>&freeze=1` gives the same frame twice; `?auto=1` ends as before; the game state at every moment equals the original (pictures only).
- [Painted parallax layers] Renaming one layer file makes only that layer fall back to the old drawing; no console error.
- [Art-direction lock] The hero, at least one prop, the floor and one icon show the generated art; nothing else changed size, position, timing or rules.
- [Art-direction lock] `?t=<ms>&freeze=1` gives the same frame every time, with the art; `?auto=1` ends as before; no console errors (a missing file only falls back).
- [Art-direction lock] Removing one image file from the folder makes only that drawing fall back to the old art.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `painted-parallax.js` sha256 `aa826d30f1d53120...`, `art-direction-lock.js` sha256 `6e35a7a52c05ab9d...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Painted parallax layers] Grep the old boot, `requestAnimationFrame` and the `?t=` loop: each runs once, from `onReady`.
- [Painted parallax layers] Grep `GameDNA_PaintedParallax.create`: once, not in a loop or restart path.
- [Painted parallax layers] Worked example: 640x360 view, ground tiles start at y 312 -> `ground: 0.87`; camera at x 1200 -> mid layer offset floor(1200 x 0.48) = 576 px.
- [Art-direction lock] Grep the old boot, `requestAnimationFrame` and the `?t=` loop: each runs once, from `onReady`.
- [Art-direction lock] Grep `GameDNA_Assets.draw(` / `fillTiled(`: every call sits in `if (!...)` with the old drawing as the fallback.
- [Art-direction lock] Walk one sprite: old top-left (x, y), size (w, h) -> foot = (x + w/2, y + h) -> `draw(ctx, key, x + w/2, y + h, {h})`.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.
