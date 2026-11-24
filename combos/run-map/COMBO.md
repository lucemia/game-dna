# Add branching run map to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `run-map.js` (one global, `GameDNA_RunMap`), API reference `run-map.README.md`

README example names are placeholders.

## Where it goes in my game (my choice; follow it exactly)

- **Branching run map:** The run map wraps the game's existing play: battle = one of my normal fights, elite = a tougher fight, boss = my final fight.

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Branching run map [systems].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Branching run map:** the place where a fight (or room, wave) starts, called from onEnter for battle / elite / boss nodes, scaled by node.tier and node type; every place where that fight is decided (won, lost, fled): run.finish({won}); the place where a new game starts: run.start(); the stats rest / shop / event choices change (HP, max HP, attack, coins), written by the designer's apply functions; a fixed update step (the map's only clock), also while the world is paused for it; key-down events or polled edges; pointer in native px; the play field size in native px and HUD rects to keep clear; the autoplay flag.

## Element 1: Branching run map (`run-map.js`, `GameDNA_RunMap`)

A seeded roguelite route: floors of battle, elite, event, shop and rest nodes joined by paths that never cross, rising to a boss. `start()` at a new game opens the map; the player picks a connected node (arrows, mouse, touch), a token travels there, and the module calls the game's `onEnter(node)`. Fight nodes (`battle`, `elite`, `boss`) start the game's own fight or room; the game calls `finish({won})` where that fight is decided and the map comes back one floor higher with the route in gold. Rest, shop and event nodes are module panels running the game's own `apply` choices. While `busy()` the world waits; autoplay picks by itself.

**The run map wraps the game's existing play: battle = one of my normal fights, elite = a tougher fight, boss = my final fight.**

**Parameters chosen:** `seed` = 1, `floors` = 6, `width` = 5, `paths` = 4, `wElite` = 14, `wEvent` = 22, `wShop` = 8, `wRest` = 10, `eliteFrom` = 3, `look` = auto, `autoRoute` = balanced.

**Where it goes** (by role; find these places in my game):

1. *Game data, next to the player's stats:* Node content with original neutral-fantasy names: `nodes: {rest: {choices: [2 choices]}, shop: {choices: [3 items with cost]}, event: {pool: [3 events {title, text, choices: [2]}]}}`; each choice `{label, text, cost, priority, apply: node => '<result line>'}` changes a stat the game already has (HP, max HP, attack, coins). **A game without coins gets none**: no `cost`, no `getGold` / `spendGold`; the shop becomes one free pick and events trade HP for max HP or attack. Never add HUD bars for new or duplicate stats.
2. *Once, after the screen size and HUD layout exist (one instance for the whole game):* `run = GameDNA_RunMap.create({view: {w, h}, params: {seed: 1, floors: 6, width: 5, paths: 4, wElite: 14, wEvent: 22, wShop: 8, wRest: 10, eliteFrom: 3, look: 'auto', autoRoute: 'balanced'}, uiRects: () => [HUD rects], autoplay: () => <autoplay flag>, hpFrac: () => hp / maxHp, getGold: () => coins, spendGold: n => { coins -= n; }, onEnter: node => {...}, nodes: NODES})`.
3. *Every place a new game starts (after the title, restart from a pause menu, after game over):* `run.start()`.
4. *Where a fight, room or wave starts (battle = one of my normal fights, elite = a tougher fight, boss = my final fight):* From `onEnter(node)`: `battle` starts one of the game's fights, `elite` a tougher one (scale by `node.tier`, 0 bottom to 1 top), `boss` the final fight or goal. What the old game reached by walking (a gate, the final area) opens at the boss node, so the autopilot cannot finish the game before the run reaches it; until then the HUD's pre-run objective text shows the current node (or hides).
5. *Every place that fight is decided: won, lost, fled, timed out:* `run.finish({won: true | false})` once (only while `run.away()` is set). After the boss, the game's own ending runs.
6. *Top of your fixed update step (the one the animation loop, the `?t=&freeze=1` fast-forward and autoplay all call), before the world and the autopilot:* `if (run.busy()) { run.update(1000 / 60); return; }`; when not busy: `run.update(1000 / 60)` once per step.
7. *Key handler; pointer handler:* First line of keydown: `if (run.key(e.code, true)) { e.preventDefault(); return; }`; keyup: `run.key(e.code, false)`. Polled input: `run.press('left' | 'right' | 'confirm' | 'back')` on edges. Pointer in native px: `run.pointer(x, y, down)`.
8. *Your draw pass:* `run.draw(ctx)` last, after the HUD and the game's own windows, under the HUD's canvas transform, outside any shake translate.

**Common mistakes** (symptom -> fix):

- The map never returns after a fight -> one ending of that fight (fleeing, a timeout, a second win path) does not call `finish()`.
- `?auto=1` hangs on the map -> pass the autoplay flag and keep `update()` in the fixed step the freeze loop calls.
- `?auto=1` ends before the boss node or never reaches it -> the old goal is still open from the start (or stays shut): open it at the boss node.
- A choice says +2 but nothing changes -> `apply` writes a copy or a field nothing reads.
- Coins are taken twice -> pass `spendGold` only when `apply` does not charge already.
- A restart keeps the old route -> `start()` at every new game.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Branching run map] A new game opens the map; arrows / mouse / touch move between connected nodes only; Z travels; the route is drawn in gold and paths never cross.
- [Branching run map] battle = one of my normal fights, elite = a tougher fight, boss = my final fight: each fight node plays the game's fight and the map returns one floor higher; rest / shop / event choices change the game's real stats; the boss ends the run with the game's own ending.
- [Branching run map] `?t=<ms>&freeze=1` gives the same frame every time; `?auto=1` still ends, no console errors.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `run-map.js` sha256 `5a27425b684890c3...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Branching run map] Grep `start(`: at every new game. Grep `finish(`: on every path out of a fight that `onEnter` starts. Grep `create(`: once.
- [Branching run map] Grep `update(`: every fixed step including while busy; the busy gate sits before the autopilot.
- [Branching run map] Walk one floor: `start()` -> fade 0.32 s -> about 0.9 s later (autoplay) or Z -> travel 0.62 s -> `onEnter(battle)` -> fade 0.26 s -> the fight -> `finish({won: true})` -> the map reopens with that node checked.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.
