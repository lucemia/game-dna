# Add Art-direction lock and Layered cutout characters to my game

Add the 2 game elements below to MY existing game, which you have not seen. Each is a finished module file given with this prompt:

- `art-direction-lock.js` (one global, `GameDNA_Assets`), API reference `art-direction-lock.README.md`
- `cutout-characters.js` (one global, `GameDNA_Cutout`), API reference `cutout-characters.README.md`

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Art-direction lock [foundations], (2) Layered cutout characters [effects].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Art-direction lock:** the game's boot function (first step, ?t= fast-forward, first animation frame), moved into the onReady callback; each draw site to replace: hero, props, floor, item icons, with its drawn size and foot point in canvas px; optional: skins/skin-api.js v0.5 to route tile / prop / frame / icon / portrait / bg-layer roles.
- **Layered cutout characters:** the draw site of each replaced character: feet point, drawn height, facing, hit flash and blink; a fixed 60 Hz update step; the game's boot moved into onReady (atlases loaded before the first step); the pack: pack.js (or pack.json) + chars/<id>.webp, or the designer's own pack made with the regenerate prompt.

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

## Element 2: Layered cutout characters (`cutout-characters.js`, `GameDNA_Cutout`)

Replaces the player character (and any ally or foe a shipped character fits) with a hand-painted HD character built from cut-out parts and animated by a small bone rig: breathing idle, walk, attack with wind-up, strike and recover, hurt recoil, jump, guard, cast, feet planted by IK, a spring cape, a warm key light with a rim. The game's own timers drive the poses; rules, hit boxes and timings never change. A character whose art did not load keeps its old drawing.

**Parameters chosen:** `light` = left, `swoosh` = on, `flash` = auto. (`rim`, `shade`, `blendMs`, `shadow`: not used; your game keeps its own.)

**Where it goes** (by role; find these places in my game):

1. *The game's boot (first step, `?t=` fast-forward, first animation frame). Grep every caller:* Include `cutout-characters.js` and `pack.js` verbatim. At load time: `const CUT = GameDNA_Cutout.load(window.GameDNA_CutoutPack, {base: ''})`, one `CUT.actor(id, {h})` per replaced character (`sword`, `spear` or `mage`; one character each). Replace the boot call with `CUT.onReady(boot)`.
2. *The fixed update step, after the replaced character is updated (attack timer, hurt timer, airborne, speed, facing):* hurt -> `actor.pose('hurt', 1 - left / total)`; attack -> `actor.pose('slash', elapsed / total)` (side view; the tip lands 0.65-0.7 h ahead from k 0.22; `'attack'` = overhead chop, `'cast'` = magic); airborne -> `actor.pose('jump', vy < 0 ? 0.2 : 0.8)`; else `actor.pose(null); actor.loop(moving ? 'walk' : 'idle', {speed: |vx| / (CUT.walkSpeed(id) * h)})`. Then `actor.update(1000 / 60, {vx: speedPerSecond, h, facing})`. Restart: `actor.reset()`.
3. *Each draw site of a replaced character (feet point, drawn height, facing, hit flash, blink):* `if (!actor.draw(ctx, feetX, feetY, {h, facing, flash: 'auto', alpha, light: 'left', shadow: onGround, swoosh: true})) <old drawing>`. Drop the old body, weapon and swing line; keep effects. `actor.point('tip', feetX, feetY, {h, facing})` = the weapon tip for sparks.

**Common mistakes** (symptom -> fix):

- Old drawing on frozen frames -> the boot ran before the atlases loaded; boot from `CUT.onReady`.
- Frozen frame differs from play -> `pose` / `play` / `update` called in draw; call them in the fixed step only.
- Two weapons on screen -> the old sword / swing arc still drawn; the rig animates its own weapon.
- Strike lands at the wrong moment -> map the attack timer over its whole length to k 0..1 (`slash` strikes from k 0.22).
- Enemy flashes while the blade is short of it -> use `slash` (forward), not the overhead `attack`, in side-view action.
- Feet slide while walking -> loop speed = |vx| / (CUT.walkSpeed(id) * h).
- Hit flash is a white rectangle or a long pale wash -> pass `flash: 'auto'` (crisp, from the hurt pose) instead of filling the game canvas.
- Shadow floating under a jumping character -> `shadow: onGround`.
- Same picture shown as two characters -> one shipped character per game character; others keep their old drawing.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Art-direction lock] The hero, at least one prop, the floor and one icon show the generated art; nothing else changed size, position, timing or rules.
- [Art-direction lock] `?t=<ms>&freeze=1` gives the same frame every time, with the art; `?auto=1` ends as before; no console errors (a missing file only falls back).
- [Art-direction lock] Removing one image file from the folder makes only that drawing fall back to the old art.
- [Layered cutout characters] The replaced character stands where the old one stood, same height and facing, feet on the ground; it breathes when idle, winds up before it strikes, recoils when hurt.
- [Layered cutout characters] `?t=<ms>&freeze=1` gives the same frame every time; `?auto=1` ends exactly as before; no console errors.
- [Layered cutout characters] Deleting an atlas brings back the old drawing for that character only.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `art-direction-lock.js` sha256 `6e35a7a52c05ab9d...`, `cutout-characters.js` sha256 `4620d22d54413cd3...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Art-direction lock] Grep the old boot, `requestAnimationFrame` and the `?t=` loop: each runs once, from `onReady`.
- [Art-direction lock] Grep `GameDNA_Assets.draw(` / `fillTiled(`: every call sits in `if (!...)` with the old drawing as the fallback.
- [Art-direction lock] Walk one sprite: old top-left (x, y), size (w, h) -> foot = (x + w/2, y + h) -> `draw(ctx, key, x + w/2, y + h, {h})`.
- [Layered cutout characters] Grep `.draw(ctx`: each cut-out draw sits in `if (!...)` with the old drawing.
- [Layered cutout characters] Grep `GameDNA_Cutout.load` and `.actor(`: called once, at load time.
- [Layered cutout characters] Grep `.pose(` / `.play(` / `.update(`: only in the fixed step.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.
