# Add Match-3 battle board to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `match3-battle.js` (one global, `GameDNA_Match3Battle`), API reference `match3-battle.README.md`

README example names are placeholders.

## Shared premises

1. **Include each module file verbatim; never edit it.** Load it with its own `<script src>` before the game's script, or paste it unchanged into its own `<script>` tag. If a module seems to need a change, adapt my game around it and tell me.
2. **Resolution:** keep my game's native resolution and integer scaling as they are. Call module draw functions on my 2D context inside the same transform as my sprites (one module pixel = one game pixel), and keep my game's own image-smoothing setting (off for pixel art, on for smooth or HD games; never switch it).
3. **Time:** drive every module from one fixed 60 Hz step (1000 / 60 ms). If my loop uses variable delta time, accumulate it and run whole steps (at most 250 ms per frame). Turn/phase logic stays mine; modules still update every step to animate.
4. **Coordinates:** native screen pixels (world minus camera) unless a section says tiles.
5. **Art and names:** anything new you draw or name is original (no real game, character, place or brand names); English UI text; do not restyle my game.
6. **Hook, don't replace:** add calls or change bodies; never delete or rename a function.
7. **Keep every other caller working.** Find every caller and reader of what you change (turn order, input, moves, menus, HUD): autopilot/AI, test hooks, URL parameters such as `?auto=1`, `?t=` and `?freeze=1`, keyboard shortcuts, end-turn buttons. Update each one. My game's own autoplay must still finish a whole game. Keep existing HUD info (HP bars, max HP) and existing commands.

## Order of work

1. **Read the game first.** Write down (file, function) where these live: loop/update step; draw pass and its order (background, actors, effects, HUD); input; where damage/HP changes are applied; where turns, actions or selections are chosen and played; HUD windows and their rects; camera; battle/scene start and end; and every caller from premise 7.
2. **Check the prerequisites** below against those notes. If one is missing, add the smallest working version and tell me.
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Match-3 battle board [systems].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Match-3 battle board:** a party (hero ids), the foes of each wave (enemy ids) and a seed per battle; gem, hero, skill and enemy tables (built-ins ship; the game adds its own as plain data); a fixed 60 Hz update step; a way to draw characters and a backdrop (hooks; a code-drawn fallback ships); a place to go when the battle ends (win / lose).

## Element 1: Match-3 battle board (`match3-battle.js`, `GameDNA_Match3Battle`)

Adds a match-3 battle: an 8 x 8 board of faceted gems (one silhouette per colour), swaps of neighbours, runs of 3+ that clear and cascade (each step worth more), Row / Column shards for 4, Blast gems for L / T, Prisms for 5; every colour powers the hero of that colour (attack, skill charge), hearts heal, foes count down and strike at 0; waves, skills, ward, weaknesses. Boards never start with a match and always have a move (or reshuffle); refills and cascades are seeded; swaps and falls always animate; a bot plays through the same input path. Wide (stage left, board right) and tall (stage on top) layouts.

**Parameters chosen:** `specials` = on, `combo` = 0.25, `weakMult` = 1.5, `speed` = 1, `hints` = on, `numbers` = on, `layout` = auto.

**Where it goes** (by role; find these places in my game):

1. *How your game maps onto it (decide before coding):* The battle becomes a mode of your game (entered where your game starts an encounter); your party members may become hero entries `{name, gem, atk, hp, skill, look, attack}`, your foes enemy entries `{name, look, hp, atk, every, weak, attack, special}`, your abilities skill entries `{name, cost, effects: [...]}` (formats in the module README). Built-in gems, heroes, skills and foes ship.
2. *Once, where the battle mode starts:* `m3 = GameDNA_Match3Battle.create({view: {x: 0, y: 0, w, h} (your logical canvas; 960 x 540 or 540 x 960 fit best), seed, params: {specials: 'on', combo: 0.25, weakMult: 1.5, speed: 1, hints: 'on', numbers: 'on', layout: 'auto'}, drawActor: (ctx, a) => <draw your sprite a.look at a.x, a.footY - a.lift, height a.h, facing a.facing, white flash a.flash, alpha a.alpha; return true>, drawBackdrop: (ctx, r) => <your scenery in r; return true>, onHit: hit => <your hit feedback>, onEvent: ev => <your sounds>, onEnd: (result, info) => <your win / lose code, once>})`; per encounter `m3.start({waves: [[foe ids], ...], seed})`.
3. *Your fixed step (every loop that steps the game, fast-forwards included):* `m3.update(stepMs)` once per step, `0` while your world is frozen; never behind a menu or animation check.
4. *Where the battle is drawn:* `m3.drawScene(ctx)`, then your effects, then `m3.drawUI(ctx)`; keep your own title and result screens around it. Never draw over `m3.boardRect()`.
5. *Your input while the battle runs:* Keys -> `m3.key('up' | 'down' | 'left' | 'right' | 'ok' | 'back' | 'target' | '1'..'4')`; pointer -> `m3.pointer('down' | 'move' | 'up', x, y)` in logical px. Your autoplay -> `m3.setAuto(true)`.
6. *Where the battle ends:* In `onEnd(result, info)` (`'win'` | `'lose'`): run your existing win / lose code exactly once, set any phase your other code and tests read.

**Common mistakes** (symptom -> fix):

- The board starts with matches, or the bot stalls -> you filled cells yourself; let `start` fill the board.
- Gems snap or jump -> `update()` skipped or called with 0 during play; call it every step.
- A different battle every reload -> pass a fixed seed; content code never uses `Math.random` (use `m3.api.rng()`).
- Foes face away from the heroes -> you mirrored sprites yourself; draw with `a.facing` (heroes right, foes left).
- Taps miss gems -> pass logical px (canvas css px scaled to your logical size), not page px.
- Tiny text on phones -> use the tall layout with 540 logical px across.
- Two sets of damage numbers -> your own number system draws from `onHit`: pass `params.numbers: 'off'`.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Match-3 battle board] Same seed, two loads, two window sizes: the same boards and, under autoplay, the same battle.
- [Match-3 battle board] A swap that matches nothing animates there and back and costs no turn; four in a row leaves a shard.
- [Match-3 battle board] Your autoplay still finishes; no HUD covers the board at 390 px.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `match3-battle.js` sha256 `acd741e35da7edfd...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Match-3 battle board] Trace one turn: key / pointer -> swap -> match -> clear -> fall -> cascade -> settle -> heroAttack -> onHit -> foeTurn -> foeAttack -> idle.
- [Match-3 battle board] Walk one hit: the Knight (atk 15) after a plain 3-Ember match deals 15 to a wolf, 23 to a slime (weak to Ember, x1.5).
- [Match-3 battle board] Walk one cascade: a second-step match of 3 weighs 3 x 1.25 = 3.75 gems.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.
