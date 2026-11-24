# Add Stamina & outpost rest to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `stamina-rest.js` (one global, `GameDNA_StaminaRest`), API reference `stamina-rest.README.md`

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Stamina & outpost rest [rules].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Stamina & outpost rest:** a list of combatants/units; an enemy action chooser; turn clock: the place a move is committed (march) and the place each side's phase begins (turnStart); real-time clock: the attack cooldown (divided by speedScale while winded); walking is measured by the module; rest sites in the game's coordinates (camp, outpost, shrine, fire) with their starting owner; a fixed 60 Hz update step; optional: the AI / autoplay's target choice, to send exhausted units to nearestSite().

## Element 1: Stamina & outpost rest (`stamina-rest.js`, `GameDNA_StaminaRest`)

Squads (or a hero) spend stamina on every march and attack; at zero they are exhausted (attacks refused, or slower) until they recover to recoverAt. Resting inside a camp, outpost or shrine their side holds refills the pips per phase (turn) or per second (real-time) with a glow, embers and REST +N; holding an empty or enemy site claims it. Pips above each unit avoid HUD rects and other units; TIRED / TOO TIRED tags, a sweat drop and campfire / banner / shrine markers with a capture ring.

**Parameters chosen:** `clock` = turn, `pace` = standard, `max` = 6, `recoverAt` = 2, `capture` = on.

**Where it goes** (by role; find these places in my game):

1. *Once at startup, after the screen size is known:* `stamina = GameDNA_StaminaRest.create({clock: 'turn', bounds: {x: 0, y: 0, w: SCREEN_W, h: SCREEN_H}, units, sites, camera, tile, uiRects, params: {pace: 'standard', max: 6, recoverAt: 2, capture: 'on'}})` (pace standard for turn games: attack 2, move 1, +1 per phase, +3 resting, no attacks at 0; real-time games: pace camp: 1 per swing, +0.6/s, fires refill, slower swings at 0). Include at least one neutral site (owner null) so captures happen; the module draws REST +N and site labels, add none of your own. `units()` returns every living unit with stamina as `{id, side, x, y, w, h}` = its drawn sprite box (world px, same space as `sites()`); `sites()` returns our camp at the start and the enemy's outpost (claimed by holding it) as `{id, kind: camp|outpost|shrine|fire, x, y, r}` or `{id, kind, x, y, w, h}` with `owner` = the side holding it at the start (or null), placed on reachable ground near the fighting; `camera()` = the scroll offset (omit when nothing scrolls).
2. *Every place an attack STARTS: player input, enemy AI, the game's autoplay, counter-attacks:* `if (!stamina.engage(id)) { <end this unit's action as a wait / skip the swing>; }` before any damage; counters: `stamina.engage(id, 'counter')` and no counter on false. Real-time: `cooldown = base / stamina.speedScale(id)` (1 unless winded).
3. *Turn clock only: where a move is committed (not a preview, not an undoable step) and where each side's phase begins:* `stamina.march(id)` once per committed move; `stamina.turnStart(side)` once where control returns to each side, after its phase banner (rest, regen and captures happen there and are seen). Move range: `stamina.moveRange(id, base)` (smaller only with pace harsh).
4. *The AI / autoplay target choice:* When `!stamina.canAttack(id)`, move toward `stamina.nearestSite(id)` (`{x, y}` world px) instead of picking a target.
5. *Your fixed update step, every scene (also the ?t= fast-forward loop):* `stamina.update(stepMs)`.
6. *Your draw pass:* Ground -> `stamina.drawSites(ctx)` -> units -> `stamina.draw(ctx)` -> HUD, outside the camera transform (inside it: pass `true` as the second argument).
7. *New game / restart:* `stamina.reset()`.

**Common mistakes** (symptom -> fix):

- `?auto=1` never ends, TOO TIRED repeating -> a refused attack does nothing and the AI picks it again: end the unit's action on false and send it to `nearestSite()`.
- Enemies attack while exhausted -> an attack path (AI, counter, autoplay) skips `engage`.
- Pips never refill (turn) -> `turnStart(side)` missing for that side.
- Stamina lost on an undone move -> `march` sits on the preview path.
- Pips drift when the camera scrolls -> `units()` and `sites()` must be world px with `camera()`, or both screen px without it.
- Pips over the HUD -> the HUD rect is missing from `uiRects()` (screen px).
- Stamina never empties in a real-time game -> use pace camp.
- A button-masher can no longer win (real-time) -> use pace camp or standard, not harsh, and slow only the attack cooldown.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Stamina & outpost rest] Pips drain on march and attack; at 0 the unit shows TIRED, its next attack is refused (TOO TIRED) or slowed, and the game moves on.
- [Stamina & outpost rest] At its phase start (or standing still) inside an owned site the unit refills with glow, embers and REST +N; holding an unowned site claims it (banner and outline change colour).
- [Stamina & outpost rest] `?t=&freeze=1` is deterministic and `?auto=1` still ends (the result may change).
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `stamina-rest.js` sha256 `a37987eef3c8f03c...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Stamina & outpost rest] List every attack start (player, AI, autoplay, counter) and its `engage` call with the false path that ends the action.
- [Stamina & outpost rest] `update` runs every step in every scene; `turnStart` once per phase per side; `march` only on commit; `units()` boxes are the drawn sprites.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.
