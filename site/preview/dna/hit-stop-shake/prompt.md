# Add Hit-stop, shake & flash to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `hit-stop-shake.js` (one global, `GameDNA_HitStop`), API reference `hit-stop-shake.README.md`

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Hit-stop, shake & flash [effects].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Hit-stop, shake & flash:** a fixed 60 Hz update step; the places where HP/MP change (hit frame); the play field draw wrapped by begin/end (or the shake offset applied by the game); HUD drawn after; optional: each unit's sprite draw wrapped by sprite(id, rect, fn), or an existing white sprite picked with flashing(id); rectangles of UI to keep clear (optional); hit-stop requests (optional).

## Element 1: Hit-stop, shake & flash (`hit-stop-shake.js`, `GameDNA_HitStop`)

On a hit the world holds still for a few frames (hit-stop), the play field shakes by whole pixels in the blow's direction and decays, and the struck sprite turns white for a frame or two; a finisher freezes longer, shakes harder and washes the field white under the HUD. Three strengths (light, heavy, finisher) and a reduced-motion mode. The module is a gate at the top of the fixed step, so a frozen step changes nothing and autoplay ends the same way, only later.

**Parameters chosen:** `strength` = heavy, `stop` = 6, `shake` = 4, `flash` = on, `reduced` = system.

**Where it goes** (by role; find these places in my game):

1. *Once, after the canvas size exists and before any reset code that calls `clear()` runs:* `juice = GameDNA_HitStop.create({view: {x: 0, y: 0, w: <field width>, h: <field height above the HUD>}, seed: 1, params: {strength: 'heavy', stop: 6, shake: 4, flash: 'on', reduced: 'system'}, uiRects})`. `uiRects()` -> HUD, banner and open menu rects in screen px.
2. *The FIRST line of your fixed update step (the one `?t=` fast-forward and `?auto=1` also run), before input is read and before the autopilot picks a move:* `if (!juice.step(<step ms>)) return;`. A frozen step must change nothing: no counters, no RNG, no input consumed (presses stay queued for the next real step).
3. *Every place a hit is ACCEPTED (after cooldown / invulnerability checks, on the step HP changes): melee, projectiles, spells, enemy and contact damage:* `juice.hit({strength: <'finisher' for killing blows / criticals, 'heavy' for strong attacks, 'light' for chip or rapid hits>, at: {x, y} <contact point, world px>, target: <unit id>, dir: <blow direction 1 | -1>})` once.
4. *Your draw pass:* `juice.begin(ctx)` before the play field's background; wrap each unit's sprite draw (only the sprite, not its shadow or bars) as `juice.sprite(ctx, id, spriteRect, () => <existing draw>)`, or pick an existing white sprite with `juice.flashing(id)`; `juice.end(ctx)` after sprites and effects; then `juice.draw(ctx, -cameraX, -cameraY)`; banners and HUD after it. Pair begin/end on every render path.
5. *Where a battle, level or run STARTS:* `juice.clear()`.

**Common mistakes** (symptom -> fix):

- Autoplay ends differently or misses a jump after a hit -> the gate sits below input reading or the autopilot; it must be the first line of the step.
- A key pressed during the freeze is lost -> input was read and cleared before the gate.
- Sprites flash but nothing freezes -> `step()` runs only in the rAF loop or not at all; call it in the fixed step.
- The world never unfreezes -> the game checks `frozen()` but never calls `step()`.
- The HUD shakes too -> draw it after `end()` and `draw()`.
- A shadow or HP bar turns white -> `sprite()` wraps more than the sprite image.
- The game crawls during a fight -> `hit()` sits in a per-frame overlap loop; call it once where the hit is accepted.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Hit-stop, shake & flash] A heavy hit: the struck sprite is white for 2 frames, the field (not the HUD) is offset by whole pixels, the world holds still for about 6 frames.
- [Hit-stop, shake & flash] A killing blow: a longer freeze, a stronger shake and a brief white wash of the field under the HUD; with `reduced: 'on'` no shake and one short flash.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `hit-stop-shake.js` sha256 `61f0763b8017e229...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Hit-stop, shake & flash] `juice.step` is the first statement of the play step: trace one frozen step and confirm nothing changes game state.
- [Hit-stop, shake & flash] Every damage site calls `juice.hit` exactly once; begin/end are paired on every render path and the HUD is drawn after `end`; `juice.clear()` runs at scene start.
- [Hit-stop, shake & flash] Walk one finisher with the defaults: 12 frozen steps, shake ±4 px decaying over 18 frames, a 2-frame white sprite and a 2-frame screen flash.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.
