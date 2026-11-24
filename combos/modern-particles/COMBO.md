# Add modern particle system to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `modern-particles.js` (one global, `GameDNA_Particles`), API reference `modern-particles.README.md`

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Modern particle system [effects].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Modern particle system:** fixed update step to advance the particle clock (the same step ?t= fast-forward runs); 0 or skipped while paused; event sites in the step: hit accepted (contact point, attacker facing), defeat (centre, optional sprite image), pickup, landing / jump (feet), hurt, checkpoint / heal / respawn; a camera offset; optional: ground(x, y) in world px from the game's collision test, so sparks and drops bounce on it; rectangles of UI to keep clear (optional).

## Element 1: Modern particle system (`modern-particles.js`, `GameDNA_Particles`)

A pooled, seeded particle engine: hits throw streak sparks that fall, bounce on the floor and skid; defeats flash with a ring, sparks, embers and smoke; pickups twinkle; landings kick dust; ambient sources (torches, portals, opened doors) get embers, smoke or orbiting magic motes. Soft glowing sprites on HD canvases, whole-pixel particles on native pixel canvases; additive glow backs off on bright frames. Motion depends only on the seed, call order and game time.

**Parameters chosen:** `budget` = 2000, `density` = 1, `scale` = 0, `render` = auto, `glow` = auto, `gravity` = 1, `wind` = 0, `bounce` = 1.

**Where it goes** (by role; find these places in my game):

1. *Once at load, after the canvas exists:* `fx = GameDNA_Particles.create({seed: 1, view: {x: 0, y: 0, w: <logical width>, h: <logical height>}, params: {budget: 2000, density: 1, scale: 0, render: 'auto', glow: 'auto', gravity: 1, wind: 0, bounce: 1}, ground, uiRects})`. `view` in the game's logical px (not the devicePixelRatio backing size). `ground(x, y)` -> world px: top y of the first solid surface at or below (x, y), or `null` over a pit, built from the game's own collision test without changing it (leave it out if there is no floor). `uiRects()` -> HUD, message box and end-panel rects in screen px (clipped out).
2. *Event sites in the update step, once per event, world px:* hit accepted (after cooldown / invulnerability): `fx.emit('sparks', contactX, contactY, {facing: attacker left of target ? 1 : -1, amount: 0.6})`; defeat: `fx.emit('burst', cx, cy)` (+ `shape: {type: 'outline', image, w, h}` when the sprite is an image or canvas); pickup: `fx.emit('pickup', x, y)`; landing and jump: `fx.emit('dust', feetX, feetY, {floor: feetY})`; player hurt: `fx.emit('burst', x, y, {color: 'blood', amount: 0.4})`; checkpoint, heal, respawn: `fx.start('swirl', x, y, {duration: 1200})`. Use at least four that fit the game.
3. *Ambient sources the level already draws (torches, lava, portals, chimneys, an opened door):* `fx.start('embers' | 'smoke' | 'fountain' | 'swirl', x, y)` once when the source starts or appears; keep the handle (`move` it if the source moves).
4. *Your fixed update step, every scene, including the `?t=` fast-forward:* `fx.update(stepMs)`; skip it or pass 0 while paused.
5. *Your draw pass, after world sprites, before the HUD, outside the camera translate:* `fx.draw(ctx, -cameraX, -cameraY)` (plus any constant offset the world drawing adds); keep the devicePixelRatio transform.
6. *Where a run or level restarts, before its ambient emitters start again:* `fx.clear()`.

**Common mistakes** (symptom -> fix):

- Effects missing or different in `?t=&freeze=1` stills -> emits in the draw code, or `update` not in the fast-forward loop; emit in the step.
- Dozens of effects per hit -> the emit sits in a per-frame overlap test; emit where the hit is accepted.
- Console warns about 64 emitters -> `start` is called every frame; start once, keep the handle.
- Particles slide with the camera -> emit in world px, pass `-camera` to `draw` outside the camera translate.
- Particles tiny or huge -> `view` given in devicePixelRatio backing px instead of logical px.
- Sparks fall through the floor -> no `ground` (world px) and no `floor` option.
- Particles over the HUD -> pass HUD rects (screen px) from `uiRects()`.
- Autoplay ends differently -> added code changed game state or used `Math.random`; particles never need either.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Modern particle system] A hit throws streak sparks that fall, bounce and skid; a defeat flashes with a ring, sparks and embers; pickups twinkle; landings kick dust.
- [Modern particle system] No particle covers the HUD; particles stay with the world when the camera scrolls; `?t=4000&freeze=1` gives the same picture twice.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `modern-particles.js` sha256 `e99934f983677666...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Modern particle system] List every event site and its one emit (none before the hit is accepted, none in draw code); ambient `start` calls run once.
- [Modern particle system] `fx`, `ground` and `uiRects` exist before the first step; `ground` uses world px, `uiRects` screen px; trace one hit: event -> `fx.emit` -> `fx.update` -> `fx.draw` with the camera offset.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.
