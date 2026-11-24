# Add a horde survival mode (auto-firing weapons, swarming waves, pick 1 of 3 on level-up)

Defaults: enemyCap {{enemyCap}}, spawnRate {{spawnRate}}, duration {{duration}} s until the boss, heroSpeed {{heroSpeed}}, magnet {{magnet}}, startWeapon {{startWeapon}}, choices {{choices}}, hpScale {{hpScale}}, numbers {{numbers}}.

You get `horde-survival.js` (global `GameDNA_HordeSurvival`) and its README. Include it **verbatim** (`<script src>` or pasted); never edit it. It owns the run: hero walking, weapons firing on timers, waves spawned outside the view, swarm steering, XP gems, the level-up window, timer, kills, boss, win / lose, HUD and a bot.

## Steps

1. **Read first.** Find your fixed update step (every loop that advances the game, fast-forwards included), your draw function, key and pointer handling, autoplay, and where a mode starts and ends. Keep every caller working.
2. **Create** where the mode starts: `run = GameDNA_HordeSurvival.create({view: {x: 0, y: 0, w, h} (logical canvas), seed, params: {enemyCap: {{enemyCap}}, spawnRate: {{spawnRate}}, duration: {{duration}}, heroSpeed: {{heroSpeed}}, magnet: {{magnet}}, startWeapon: '{{startWeapon}}', choices: {{choices}}, hpScale: {{hpScale}}, numbers: '{{numbers}}'}, paintActor, onHit, onEnd})`, then `run.start({seed})`.
3. **Art.** `paintActor(ctx, look, x, footY, {h, facing})` paints ONE still pose of `'hero'` or a foe look with feet at (x, footY), `h` px tall, facing `'left'`/`'right'`, and returns true; the module caches and animates it. A sprite holding a weapon or with baked light needs art painted for each side, not a mirror. Map monsters to foes as data (README "Content is data"); single-pose art gets a `gait` (hop, fly, float, glide, stomp), never sliding legs; a hero walk sheet goes in `heroFrames`.
4. **Step**: each fixed step, `run.setInput(x, y)` from held movement keys (-1..1), then `run.update(stepMs)`, every step of the mode, never behind a menu check (it pauses itself under its level-up window). Your autoplay: `run.setAuto(true)`.
5. **Draw**: replace the mode's world drawing with `run.drawWorld(ctx)`, your effects, then `run.drawUI(ctx)`; overlays after. Scale for devicePixelRatio.
6. **Input**: Left / Right / confirm -> `run.key('left' | 'right' | 'ok')`; pointer down / move / up -> `run.pointer(type, x, y)` in logical px (drag = touch stick, tap = take a card). Fresh presses only.
7. **End**: `onEnd(result, info)` ('win' / 'lose'; `info.time`, `kills`, `level`): run your results code exactly once and set any phase your other code and tests read.
8. **Hits**: `onHit(ev)` per HP change (`target` 'hero' or a foe id, `amount`, `killed`, world `x, y`), read-only. Own damage numbers: `numbers: 'off'`. Screen positions: `run.anchor(id)`; HUD rects: `run.uiRects()`.

## Rules

- No `Math.random`, clock or DOM in step code or content functions (`api.rng()` in a custom weapon): runs replay from the seed.
- Never change HP yourself during the mode; add weapons, foes, upgrades as data (`run.addWeapon / addEnemy / addUpgrade`).
- Never delete helpers; stop calling replaced ones.

## Checks you run yourself

- Foes walk in from beyond the screen edges; at 2-3 minutes 200+ are on screen and frames stay smooth.
- Weapons fire alone; gems fly to the hero; a level-up dims the world with 3 cards, and Left / Right / confirm or a tap takes one.
- Timer and kills run; the boss arrives at {{duration}} s; its death or dawn shows DAWN BREAKS, the hero's FALLEN; then your results code runs once.
- Characters face the way they walk.
- Autoplay and any fast-forward or screenshot mode reach the end with no console errors.

## Self-check without a browser

Re-read call sites of anything replaced; check load-time identifiers exist; trace one hit: weapon -> `onHit` -> kill -> gem -> level -> card -> `update`. Worked example: a slime at minute 2 has round(8 x (1 + 2 x 0.55 x {{hpScale}})) HP.
