# Add modern damage numbers, hit-stop, shake & flash and hit sparks & spell bursts to my game

Add the 3 game elements below to MY existing game, which you have not seen. Each is a finished module file given with this prompt:

- `damage-pop.js` (one global, `GameDNA_DamagePop`), API reference `damage-pop.README.md`
- `hit-stop-shake.js` (one global, `GameDNA_HitStop`), API reference `hit-stop-shake.README.md`
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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Modern damage numbers [effects], (2) Hit-stop, shake & flash [effects], (3) Hit sparks & spell bursts [effects].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Modern damage numbers:** the places where HP/MP change (hit frame); screen positions of targets; a world clock in ms that can pause; rectangles of UI to keep clear (optional).
- **Hit-stop, shake & flash:** a fixed 60 Hz update step; the play field draw wrapped by begin/end (or the shake offset applied by the game); HUD drawn after; optional: each unit's sprite draw wrapped by sprite(id, rect, fn), or an existing white sprite picked with flashing(id).
- **Hit sparks & spell bursts:** spell event: target body centre and element (fire, ice, thunder, heal); a world clock in ms that can pause.

## Element 1: Modern damage numbers (`damage-pop.js`, `GameDNA_DamagePop`)

On the frame a hit lands, its amount arcs out of the target and lands above it; crits pop big with a burst and a short shake; rapid hits of one type on one target roll into one total that punches on each add (12 -> 47 -> 83); each damage type has a colour and a small icon (fire, ice, shock, poison, arcane, heal, shield, mana; physical is plain white); misses and blocks are small words. Big numbers stay on top; nothing lands on another unit, its HP bar, UI rects or another number. Smooth on HD canvases, crisp 1-bit on native pixel canvases.

**Parameters chosen:** `size` = 0, `duration` = 1100, `arc` = 1, `punch` = 0.6, `merge` = 600, `hitstop` = 50, `palette` = vivid, `icons` = on, `crit` = burst, `render` = auto, `stack` = on.

**Where it goes** (by role; find these places in my game):

1. *Once, after your units and the play-field size exist, before the first hit:* `dp = GameDNA_DamagePop.create({bounds, params: {size: 0, duration: 1100, arc: 1, punch: 0.6, merge: 600, hitstop: 50, palette: 'vivid', icons: 'on', crit: 'burst', render: 'auto', stack: 'on'}, getAnchor, getObstacles, onHitStop, onShake, onFlash})`. `bounds` = play field above the HUD in logical canvas px. `getAnchor(id)` -> `{x, top, w, h}`: sprite centre x, top of what is drawn above the head (hover, HP bar), size; keep answering for dead units; a lunging attacker returns its home spot. `getObstacles()` -> each living unit's sprite rect with `id` (also at its home spot if it moves), HP bars with the unit's `id`, every HUD window, banner and message box without `id`. Scrolling games: screen px (world minus camera) everywhere. `onHitStop` / `onShake` / `onFlash`: your freeze / shake / flash, or nothing.
2. *Every place your game changes HP, MP or a status (attacks, spells, items, ticks, level-up heals, refills, hits on the player). Grep every write to HP and MP:* Right after each change, once: `dp.spawn(target.id, realChange, kind, {type, crit})`; `realChange` = the change after clamping. Kinds `damage | crit | heal | shield | mp | miss | block | dodge | status` (status: the word as amount); types `physical | fire | ice | shock | poison | arcane | heal | shield | mana` (map yours to the nearest). Mana restored: `spawn(id, gain, 'heal', {type: 'mana'})`.
3. *Your fixed update step (every scene, so numbers finish fading):* `dp.update(stepMs)`; `dp.update(0)` while the world is frozen (hit-stop) or paused by a window.
4. *Your draw pass, after actors and hit effects, before banner and HUD:* `dp.draw(ctx)` once per frame in screen coordinates (inside a camera translate: `dp.draw(ctx, camX, camY)`), inside any shake translate. Never clip, proxy or filter its drawing: placement already avoids every rect in `getObstacles()`.
5. *Where a battle, wave, level or new game STARTS, before anything spawns there:* `dp.clear()` (numbers spawned since the last `update` survive it).

**Common mistakes** (symptom -> fix):

- Each hit shows two numbers -> the game's own (or E-01's) numbers are still drawn; this module replaces them.
- Rapid hits never merge -> they use different `type`s or kinds, or are further apart than `merge`; pass one type per attack.
- A total jumps instead of rolling -> spawn each hit's amount, not the running total.
- Numbers on a neighbour's HP bar or head -> `getObstacles()` lacks that unit, its `id`, or its HP bar rect.
- Numbers smeared on a native pixel game drawn into a larger backing store -> `render: 'crisp'`.
- Kill numbers missing or at the field centre -> `getAnchor` returned `null` for the dead unit.
- Numbers missing in `?t=&freeze=1` shots, or jumping after hit-stop -> advance only through `update` (0 while frozen), never on wall-clock time.
- Numbers slide over the HUD in a scrolling game -> mixed world and screen coordinates.
- Numbers cut off or missing although `dp.lastDrawn()` lists them -> the game clips (evenodd around obstacles), proxies or filters `dp.draw`; draw it once, unclipped.
- Wave-refill heals pile into one strip above the party -> they were spawned under the WAVE banner; spawn them when the banner ends.
- `MISS` on the player with no enemy near, or `+0` heals -> spawn `miss` only for an attack aimed at a unit; skip changes of 0.

## Element 2: Hit-stop, shake & flash (`hit-stop-shake.js`, `GameDNA_HitStop`)

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

## Element 3: Hit sparks & spell bursts (`hit-sparks.js`, `GameDNA_HitSparks`)

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

## Cross-element wiring

**Modern damage numbers with Hit-stop, shake & flash:**

- **hit-stop:** Route every other hit-stop request here: `onHitStop: ms => juice.freeze(ms)` and `onShake: (px, ms) => juice.shake(px, ms)`. Then ONE gate (`juice.step`) freezes the world for every element; do not add a second freeze counter. `onHitStop(ms)` starts it; `dp.update(0)` meanwhile.

**Modern damage numbers with Hit sparks & spell bursts:**

- **hit-stop:** Every hit calls `onHitStop(ms)` (doubled on criticals): one freeze counter in your game serves all elements. `onHitStop(ms)` starts it; `dp.update(0)` meanwhile.

**Hit sparks & spell bursts with Hit-stop, shake & flash:**

- **hit-stop:** Route every other hit-stop request here: `onHitStop: ms => juice.freeze(ms)` and `onShake: (px, ms) => juice.shake(px, ms)`. Then ONE gate (`juice.step`) freezes the world for every element; do not add a second freeze counter. `fx.update(0)` while frozen.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Modern damage numbers] A hit shows its number on the hit frame, arcing up and landing above the target, then fading.
- [Modern damage numbers] Three quick hits of one type on one target show one rolling total that punches on each add; a crit is bigger with a burst; heals green `+n`; `MISS` / `BLOCK` as small words; type colours and icons.
- [Modern damage numbers] No number touches another unit, its HP bar, a window, a banner or another number; big numbers are never covered by small ones.
- [Hit-stop, shake & flash] A heavy hit: the struck sprite is white for 2 frames, the field (not the HUD) is offset by whole pixels, the world holds still for about 6 frames.
- [Hit-stop, shake & flash] A killing blow: a longer freeze, a stronger shake and a brief white wash of the field under the HUD; with `reduced: 'on'` no shake and one short flash.
- [Hit sparks & spell bursts] A melee hit shows a slash or star with sparks at the contact point on the hit frame, gone within a quarter second; spells show their burst (flames, ice shatter, bolt from above, green motes).
- [Hit sparks & spell bursts] Criticals (if the game has them) are bigger, flash white for a few frames, freeze briefly and shake; effects never cover the HUD or a neighbouring unit.
- [combined] Hit-stop freezes everything briefly; the number shows on the first frozen frame.
- [combined] Hit-stop freezes everything briefly; the number shows on the first frozen frame.
- [combined] During a hit-stop the impact holds on its first frame.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `damage-pop.js` sha256 `a605a213fceb55b2...`, `hit-stop-shake.js` sha256 `61f0763b8017e229...`, `hit-sparks.js` sha256 `4ffa37bc1a39cbcb...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Modern damage numbers] List every HP/MP write and the `dp.spawn` after it (no hit spawns twice; refills, level-up heals and item uses included).
- [Modern damage numbers] Walk one hit: impact -> HP change -> `dp.spawn` -> `dp.update` each step (0 while frozen) -> `dp.draw` each frame; `getAnchor` answers for dead units.
- [Hit-stop, shake & flash] `juice.step` is the first statement of the play step: trace one frozen step and confirm nothing changes game state.
- [Hit-stop, shake & flash] Every damage site calls `juice.hit` exactly once; begin/end are paired on every render path and the HUD is drawn after `end`; `juice.clear()` runs at scene start.
- [Hit-stop, shake & flash] Walk one finisher with the defaults: 12 frozen steps, shake ±4 px decaying over 18 frames, a 2-frame white sprite and a 2-frame screen flash.
- [Hit sparks & spell bursts] List every damage/heal site and its one `fx.hit` / `fx.burst`; trace one critical: `hit` -> `onHitStop` -> `update(0)` frames -> normal frames; `draw` every frame including the single `?freeze=1` frame.
- [Hit sparks & spell bursts] Identifiers in `getObstacles`, `uiRects` and the callbacks exist when first called; `fx.clear()` runs at scene start.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.
