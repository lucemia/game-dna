# Add real-time sword combat to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `sword-combat.js` (one global, `GameDNA_SwordCombat`), API reference `sword-combat.README.md`

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Real-time sword combat [systems].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Real-time sword combat:** a fixed 60 Hz update step; the player's feet box {x, y, w, h} in world px (the game keeps walking it; the module moves it only for knockback); a wall test solid(x, y, w, h) in the same world px; held directions and an attack press per step (edge-latched); enemy spawn points (id, behaviour, position) from the game's rooms or map; optional: the game's own HP getter/setter, enemy art, a hit-stop gate.

## Element 1: Real-time sword combat (`sword-combat.js`, `GameDNA_SwordCombat`)

Real-time sword fights on the map. The hero swings a sword (anticipation, active and recovery frames, a sweeping arc hitbox, 4- or 8-way) in a 2-3 hit combo with a buffered press; struck enemies flash, slide back with friction and puff when defeated, sometimes dropping hearts or gems. After being hit the hero flickers half-transparent and cannot be hurt. Enemies are small state machines: wander, chase, telegraphed charge (lane marked on the floor), keep-distance shooter (aim line, projectiles), and a boss that mixes them. The module owns all of that and draws enemies, sword, projectiles, drops and hearts; the game keeps its map, walls, hero, walking, scenes, quests and dialogue.

**Parameters chosen:** `dirs` = 4, `antic` = 4, `active` = 4, `recover` = 10, `combo` = 3, `buffer` = 12, `reach` = 22, `arc` = 150, `knockback` = 3, `friction` = 0.8, `iframes` = 60, `hitstop` = 4, `telegraph` = 24, `enemySpeed` = 1, `hearts` = 3, `overlay` = off.

**Where it goes** (by role; find these places in my game):

1. *Where a new game starts (after the hero object and the map exist):* `sc = GameDNA_SwordCombat.create({player: <the hero object; its feet box {x, y, w, h} in world px>, playerId: <the hero's id>, solid: (x, y, w, h) => <the game's wall test, NPCs and chests included>, bounds: <world rect enemies may roam>, seed, hp: {get, set, max} <the game's own HP variables>, onHit, onDefeat, onPlayerDown, params: {dirs: 4, antic: 4, active: 4, recover: 10, combo: 3, buffer: 12, reach: 22, arc: 150, knockback: 3, friction: 0.8, iframes: 60, hitstop: 4, telegraph: 24, enemySpeed: 1, hearts: 3, overlay: 'off'}})`.
2. *Where the game creates its enemies (map load, room entry):* `sc.spawn({id, brain, look, x, y, hp})` with the same ids and positions; brain by role: roamer `wander`, pursuer `chase`, rusher `charge`, ranged `shooter`, boss `warden`. On a room or level change `sc.clear()` first. Keep the game's enemy list readable (refresh it from `sc.enemies()` each step) if other code reads it.
3. *The old combat (separate battle screen, touch-to-fight trigger, old enemy AI, old invulnerability blink):* Stop entering it but keep its functions. What it counted moves into callbacks: `onDefeat` -> the defeated counter and quest progress; `onPlayerDown` -> the game-over code. The HUD keeps showing the same HP variables.
4. *The fixed 60 Hz step, map scene only (also run by `?t=` fast-forward):* `if (sc.update({x, y, attack, aim}) === false) return;` then the hero's walking only when `sc.canMove()`. `x`, `y` are the held directions; `attack` is latched on keydown and cleared after this step reads it. While a dialogue or menu is open: no `update()`. The confirm key talks or opens when something is in front, else it swings. During a swing the hero faces `sc.pose().face`.
5. *The map draw pass:* After the tiles: `sc.draw(ctx, -camX, hudH - camY, {layer: 'below'})`; then the y-sorted sprites with `sc.sprites(-camX, hudH - camY)` added (or keep the game's own enemy art and use `sc.enemyAlpha(e)`); the hero drawn with `globalAlpha = sc.playerAlpha()`; then `sc.draw(..., {layer: 'above'})`; HUD last.
6. *The game's autoplay:* Keep its route to NPCs, chests and exits; give its next waypoint (world px) to `sc.autopilot({next, speed: <walk speed>})` and use the result as the input whenever it has a `target` or `danger` (it scores moves by the danger along the path and fights).

**Common mistakes** (symptom -> fix):

- The hero never swings when tapping fast -> the attack is read from the held state; latch it on keydown.
- Swinging while a dialogue is open, or talking swings -> skip `update()` while a box is open; try talk/open first, swing otherwise.
- The hero vanishes after a hit -> the old blink sets alpha 0; use `sc.playerAlpha()` (0.4 at least).
- Enemies walk through walls or never leave a corner -> `solid` misses tiles or uses screen px; it takes world px, the same as the hero box.
- Autoplay stands still next to an enemy or walks into shots -> it still uses the old route only; feed the waypoint to `sc.autopilot()`.
- Defeated counter stays 0 / the quest never advances -> move the old battle's counters into `onDefeat`.
- Effects missing in `?t=&freeze=1` shots -> `update()` runs only in the requestAnimationFrame loop; call it from the shared step.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Real-time sword combat] A swing shows the blade and an arc trail; struck enemies flash, slide back and stop; three timed taps play the combo (the third is the bigger finisher).
- [Real-time sword combat] After a hit the hero flickers half-transparent (never invisible) and takes no damage for about 1 s.
- [Real-time sword combat] A rusher shakes and marks its lane before charging and is stunned when it hits a wall; a ranged enemy shows a dotted aim line, then fires.
- [Real-time sword combat] Autoplay still finishes the game; dialogue, title and restart work.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `sword-combat.js` sha256 `ad99944819d9f352...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Real-time sword combat] Trace one swing: keydown -> latch -> `update({attack: true})` -> 4 antic + 4 active + 10 recovery frames -> `onHit` -> knockback about 15 px.
- [Real-time sword combat] Trace a contact hit, then a second body touching the hero during the next 60 frames: no damage.
- [Real-time sword combat] Trace autoplay from the title to the end: every quest step is reached, `update()` runs in the fast-forward loop.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.
