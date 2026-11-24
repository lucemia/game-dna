# Add art-direction lock and ui frames & icon sheet to my game

Add the 2 game elements below to MY existing game, which you have not seen. Each is a finished module file given with this prompt:

- `art-direction-lock.js` (one global, `GameDNA_Assets`), API reference `art-direction-lock.README.md`
- `painted-ui.js` (one global, `GameDNA_PaintedUI`), API reference `painted-ui.README.md`

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Art-direction lock [foundations], (2) UI frames & icon sheet [ui].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Art-direction lock:** the game's boot function (first step, ?t= fast-forward, first animation frame), moved into the onReady callback; each draw site to replace: hero, props, floor, item icons, with its drawn size and foot point in canvas px; optional: skins/skin-api.js v0.5 to route tile / prop / frame / icon / portrait / bg-layer roles.
- **UI frames & icon sheet:** the game's boot function (first step, ?t= fast-forward, first animation frame), moved into GameDNA_Assets' onReady callback (L-00 loader); every panel draw site with its rect; every item / status draw site with its box; the selected-row highlight and the pointer; a map from the game's item ids to the kit's icon keys; optional: skins/skin-api.js v0.5 (frame9 and icon bitmap roles) for modules that draw through a skin.

## Element 1: Art-direction lock (`art-direction-lock.js`, `GameDNA_Assets`)

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

## Element 2: UI frames & icon sheet (`painted-ui.js`, `GameDNA_PaintedUI`)

Draws the game's windows, tooltips, selected rows, pointer and item / status icons with one generated, style-locked UI kit: nine-slice frames whose corners never stretch, a dark panel under each frame, a pulsing selection frame on the game's own clock, and 24 icons centred at one scale. Every call returns false / null when its image is missing, so the old panel or shape stays as the fallback; layout, text, input and rules do not change.

**Where it goes** (by role; find these places in my game):

1. *The boot:* Include `art-direction-lock.js` (the loader, global `GameDNA_Assets`; it comes with the kit files) verbatim before `painted-ui.js`. Load the kit once: inline the manifest entries (keep `slice`, `inset`, `corner`, `fill`, `panelInset`, `anchor`, `drawH`, `atlas`; `src` relative to the page) in the same `GameDNA_Assets.load(list, {onReady: boot})` call, then `const ui = GameDNA_PaintedUI.create({assets: GameDNA_Assets, scale: <canvas height in game px> / 360})`.
2. *Each panel / window draw (dialogue, shop, bag, pause, HUD panels, end screen):* `if (!ui.frame(ctx, rect, {variant: 'window'})) <old panel>`; tooltips, buttons and small HUD panels use `'small'`. Same rect; if text now touches the border, read `ui.inner(rect)` and nudge only that text.
3. *Each item / status picture (shop rows, bag rows or grid, HUD status, pickups shown in UI):* A map from item ids to kit keys (`potion mana-potion antidote bread scroll gem sword axe bow staff shield helmet armor boots ring amulet coins key poison burn frost shock regen guard`); `if (!ui.icon(ctx, key, x, y, size)) <old shape>` in the old shape's box. Grids may draw `ui.frame(ctx, cell, {variant: 'slot'})` under each icon.
4. *Selected row / slot and the `>` pointer:* `if (!ui.select(ctx, rect, frameCount / 60)) <old highlight>`; `if (!ui.cursor(ctx, tipX, tipY, h)) <old pointer>`.
5. *Skins (only if skins/skin-api.js v0.5 and skin-drawn modules are in the game):* In `boot`: `ui.attach(GameDNA_Skin, {skins: [<the non-pixel skin id>]})`; their window, tooltip and plate frames and the shop icons then use the kit.

**Common mistakes** (symptom -> fix):

- Frozen screenshot has plain panels or differs between loads -> the boot still runs before `onReady`.
- Corners smeared / ornament repeated along an edge -> the frame was drawn with one `drawImage`; use `ui.frame`.
- Window background missing (world shows through) -> `panel: null`, or the frame image registered in a skin by hand; use `ui.attach`.
- Text on the border ornament -> the old padding was kept; read `ui.inner(rect)`.
- Icons of different sizes -> drawn at image size; pass the slot box size.
- Selection pulse differs between frozen loads -> `t` came from wall time; pass the game's frame count / 60.
- Pixel-art game looks smeared -> generated UI targets HD styles; leave pixel games' panels as they are.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Art-direction lock] The hero, at least one prop, the floor and one icon show the generated art; nothing else changed size, position, timing or rules.
- [Art-direction lock] `?t=<ms>&freeze=1` gives the same frame every time, with the art; `?auto=1` ends as before; no console errors (a missing file only falls back).
- [Art-direction lock] Removing one image file from the folder makes only that drawing fall back to the old art.
- [UI frames & icon sheet] Every window, tooltip and item list shows the painted frames and icons at the same rects and text positions as before; corners are the same size on big and small windows.
- [UI frames & icon sheet] `?t=<ms>&freeze=1` gives the same frame every time; `?auto=1` ends as before; no console errors.
- [UI frames & icon sheet] Removing one image file makes only that picture fall back to the old drawing.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `art-direction-lock.js` sha256 `6e35a7a52c05ab9d...`, `painted-ui.js` sha256 `83abb2a436fbeb54...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Art-direction lock] Grep the old boot, `requestAnimationFrame` and the `?t=` loop: each runs once, from `onReady`.
- [Art-direction lock] Grep `GameDNA_Assets.draw(` / `fillTiled(`: every call sits in `if (!...)` with the old drawing as the fallback.
- [Art-direction lock] Walk one sprite: old top-left (x, y), size (w, h) -> foot = (x + w/2, y + h) -> `draw(ctx, key, x + w/2, y + h, {h})`.
- [UI frames & icon sheet] Grep `ui.frame(`, `ui.icon(`, `ui.select(`, `ui.cursor(`: each sits in `if (!...)` with the old drawing.
- [UI frames & icon sheet] Grep every item id the game can show: it is in the icon map or keeps its old shape.
- [UI frames & icon sheet] Grep `Date.now` / `performance.now` near `ui.select`: none.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.
