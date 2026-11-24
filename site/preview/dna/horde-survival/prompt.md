# Add Horde survival auto-attacker to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `horde-survival.js` (one global, `GameDNA_HordeSurvival`), API reference `horde-survival.README.md`

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Horde survival auto-attacker [systems].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Horde survival auto-attacker:** a fixed 60 Hz update step; a move vector from keys or a stick (the module also reads pointer drags as a touch stick); a canvas 2D context (the module draws the field, cast, shots, gems, HUD, level-up window and banners into a logical view); optional: paintActor(ctx, look, x, footY, {h, facing}) to paint each look ONCE (the module caches and animates it), drawGround, its own weapons / foes / upgrades / waves tables; a place to go when the run ends (onEnd win / lose).

## Element 1: Horde survival auto-attacker (`horde-survival.js`, `GameDNA_HordeSurvival`)

Adds a top-down horde survival mode: the hero only walks (keys or a touch stick) while its weapons fire by themselves on timers (orbiting blades, a bolt at the nearest foe, a burning area pulse with knockback, a lance that pierces a line where the hero faces); foes spawn just outside the view in rising waves (rings, packs, elites) and swarm in with separation; kills drop XP gems that fly to the hero inside a pickup reach; each level pauses the world and offers 1 of N upgrades; a timer and kill count run; a boss arrives at the end; win and lose banners. Seeded, frame-stepped, fast with hundreds of foes; weapons, foes, upgrades and waves are plain data; a bot plays through the same input.

**Parameters chosen:** `enemyCap` = 400, `spawnRate` = 1, `duration` = 200, `dawn` = 90, `heroSpeed` = 100, `magnet` = 70, `startWeapon` = bolt, `choices` = 3, `hpScale` = 1, `numbers` = on.

**Where it goes** (by role; find these places in my game):

1. *How your game maps onto it (decide before coding):* Your hero becomes the walker (`look: 'hero'`); your monsters become foes `{look, gait: 'hop'|'fly'|'float'|'glide'|'stomp', h, r, hp, speed, dmg, xp, move: 'chase'|'drift'|'swoop'|'keep'}` (single-pose art never walks on legs: give it a gait); a hero walk sheet goes in `heroFrames: {n, stride}` (`paintActor` then gets `frame`); your attacks become weapons `{kind: 'orbit'|'nearest'|'pulse'|'lance'|'custom', levels: [...]}`; this is a mode of your game: keep your title, menus and other modes.
2. *Once, where the mode starts:* `run = GameDNA_HordeSurvival.create({view: {x: 0, y: 0, w, h} (your logical canvas), seed, params: {enemyCap: 400, spawnRate: 1, duration: 200, heroSpeed: 100, magnet: 70, startWeapon: 'bolt', choices: 3, hpScale: 1, numbers: 'on'}, paintActor: (ctx, look, x, footY, {h, facing}) => <paint one still pose of that look, feet at x, footY; true>, onHit: ev => <your hit feedback>, onEnd: (result, info) => <your results code, once>})`; then `run.start({seed})`.
3. *Your fixed step (every loop that steps the game, fast-forwards included):* `run.setInput(x, y)` from your held movement keys, then `run.update(stepMs)` once per step, never behind a menu check (it pauses itself under its level-up window). Your autoplay -> `run.setAuto(true)`.
4. *Where the mode is drawn:* Replace the world drawing with `run.drawWorld(ctx)`, then your effects, then `run.drawUI(ctx)`; keep your HUD overlays and result screens after it.
5. *Your input during the mode:* Left / Right / confirm -> `run.key('left'|'right'|'ok')` (the level-up cards); pointer down / move / up -> `run.pointer(type, x, y)` in logical px (drag = touch stick, tap = take a card). Fresh presses only, not key repeat.
6. *Where the run ends:* In `onEnd(result, info)` ('win' | 'lose', `info.time`, `info.kills`, `info.level`): run your existing results / game-over code exactly once and set any phase your other code and tests read.

**Common mistakes** (symptom -> fix):

- Foes pop in at the screen edge -> you placed spawns yourself; let the wave table spawn them, or `run.spawn(kind, x, y)` outside the view.
- Slow with 200+ foes -> your `paintActor` must paint a single still pose (it is cached); never draw per foe yourself.
- Foes slide -> single-pose art with legs set to walk; use `gait` hop / fly / float / glide / stomp, or a walk sheet for the hero (`heroFrames`).
- A character with a sword or baked light looks wrong walking left -> paint or pick the left-facing art in `paintActor` from `facing`; do not mirror it.
- The level-up window never closes -> your confirm key is not forwarded with `run.key('ok')`, or only on key repeat.
- Different run every reload -> pass a fixed `seed`; never `Math.random` in a custom weapon (use `api.rng()`).
- The run never ends -> `update()` is skipped while your pause / menu flag is set; call it every step of the mode.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Horde survival auto-attacker] Foes walk in from beyond every screen edge; at 2-3 minutes 200+ are on screen and the frame stays smooth.
- [Horde survival auto-attacker] Weapons fire alone; gems fly to the hero; a level-up dims the world with 3 cards; Left / Right / confirm or a tap takes one.
- [Horde survival auto-attacker] The boss arrives at 200 s; its death shows DAWN BREAKS, the hero's FALLEN; your results code runs once; your autoplay still finishes.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `horde-survival.js` sha256 `2b385f1f02ab295f...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Horde survival auto-attacker] Trace one hit: weapon timer -> `onHit` -> kill -> gem -> level -> card -> `update` again.
- [Horde survival auto-attacker] Grep every place your game changes HP during the mode: none may run while the run is active.
- [Horde survival auto-attacker] Worked example: a slime at minute 2 has round(8 x (1 + 2 x 0.55 x 1)) HP; Seeker Bolt level 3 deals 15 per hit before Might.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.
