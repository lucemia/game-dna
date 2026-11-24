# Add Hit sparks & spell bursts to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `hit-sparks.js` (one global, `GameDNA_HitSparks`), API reference `hit-sparks.README.md`

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Hit sparks & spell bursts [effects].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Hit sparks & spell bursts:** the places where HP/MP change (hit frame); spell event: target body centre and element (fire, ice, thunder, heal); a world clock in ms that can pause; rectangles of UI to keep clear (optional).

## Element 1: Hit sparks & spell bursts (`hit-sparks.js`, `GameDNA_HitSparks`)

On the frame a blow lands, a few frames of impact at the contact point (slash streak, star burst, cross spark or ring shockwave) with pixel sparks that fall under gravity; spells land as palette-cycled fire, ice, thunder or heal bursts; criticals are bigger, flash white for 3 frames and request hit-stop and shake. Seeded and pooled, so frozen screenshots are stable.

**Parameters chosen:** `size` = 1, `life` = 14, `sparks` = 8, `gravity` = 0.15, `hitstop` = 50, `shake` = 2, `critFlash` = screen, `style` = auto, `cycle` = 2, `cap` = 192.

**Where it goes** (by role; find these places in my game):

1. *Once, after your units and the canvas size exist (before any reset code that calls `clear()` runs):* `fx = GameDNA_HitSparks.create({view: {x: 0, y: 0, w: <field width>, h: <field height above the HUD>}, seed: 1, params: {size: 1, life: 14, sparks: 8, gravity: 0.15, hitstop: 50, shake: 2, critFlash: 'screen', style: 'auto', cycle: 2, cap: 192}, getObstacles, uiRects, onHitStop, onShake})`. `getObstacles()` -> each living unit's sprite rect `{x, y, w, h, id}` in the same (world) coordinates as hit points; `uiRects()` -> HUD, banner and menu rects in screen px; `onHitStop(ms)` freezes your world; `onShake(px, ms)` shakes the field or does nothing.
2. *Every place a strike lands (melee overlap, projectile contact, enemy attacks, contact damage): where the hit is ACCEPTED, after cooldown / invulnerability checks, on the frame HP changes:* `fx.hit(x, y, {dir: <attacker facing 1 | -1>, crit: <real critical?>, target: <unit id>, from: <attacker id>})` once, with `(x, y)` on the target's body on the side the blow came from (overlap centre of hitbox and target).
3. *Every spell, item or heal that lands:* `fx.burst(cx, cy, 'fire' | 'ice' | 'thunder' | 'heal', {target, from})` at the target's body centre (closest element); if it also damages, add `fx.hit(cx, cy, {kind: 'spark', element, target})`.
4. *Your fixed update step (the one `?t=` fast-forward also runs):* While the hit-stop freeze counts down: `fx.update(0)` and skip the world step only (not input already latched, not title or result screens). Otherwise `fx.update(1000 / 60)`.
5. *Your draw pass:* `fx.draw(ctx, -cameraX, -cameraY)` after sprites and existing effects, before banners and HUD, inside any shake translate (`0, 0` without a camera).
6. *Where a battle, level, life or run STARTS:* `fx.clear()`.

**Common mistakes** (symptom -> fix):

- Dozens of effects per swing -> the call sits in a per-frame overlap test; call it where the hit is accepted (after the cooldown check).
- Effects missing in `?t=&freeze=1` shots -> `update` runs only in the rAF loop; call it from the fixed step.
- Sparks freeze then jump, or keep flying through the hit-stop -> `update(0)` while frozen, the real step otherwise.
- Effects slide with the camera -> hit points and obstacles in world space, camera offset passed to `draw`.
- Melee sparks shrink to a dot -> the attacker counts as a neighbour; pass `from: attacker.id`.
- Effects over the HUD -> pass HUD/banner rects in `uiRects` and end `view` above the HUD.
- Autoplay ends differently -> the freeze must not run on title/result screens or drop latched input.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Hit sparks & spell bursts] A melee hit shows a slash or star with sparks at the contact point on the hit frame, gone within a quarter second; spells show their burst (flames, ice shatter, bolt from above, green motes).
- [Hit sparks & spell bursts] Criticals (if the game has them) are bigger, flash white for a few frames, freeze briefly and shake; effects never cover the HUD or a neighbouring unit.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `hit-sparks.js` sha256 `4ffa37bc1a39cbcb...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Hit sparks & spell bursts] List every damage/heal site and its one `fx.hit` / `fx.burst`; trace one critical: `hit` -> `onHitStop` -> `update(0)` frames -> normal frames; `draw` every frame including the single `?freeze=1` frame.
- [Hit sparks & spell bursts] Identifiers in `getObstacles`, `uiRects` and the callbacks exist when first called; `fx.clear()` runs at scene start.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.
