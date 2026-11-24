# Add Card battle with intents to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `card-battle.js` (one global, `GameDNA_CardBattle`), API reference `card-battle.README.md`

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Card battle with intents [systems].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Card battle with intents:** a deck (list of card ids) and the foes of an encounter (enemy ids), the hero's HP / max HP; card, foe and status tables (built-ins ship; the game adds its own as plain data); a fixed 60 Hz update step; key or pointer input routed to the battle while it runs; a place to go when the fight ends (win / lose) and, optionally, a reward screen.

## Element 1: Card battle with intents (`card-battle.js`, `GameDNA_CardBattle`)

Replaces how a fight is resolved with a turn-based card battle on its own front-view stage: each turn the hero draws a fanned hand and gets a small energy pool (Lumen); cards are dragged onto a foe (a target arrow and reticle follow) or played with keys / taps; they deal damage, give ward, apply statuses, draw; played cards go to the discard pile, which is shuffled back (seeded) when the draw pile runs out; every foe shows an intent tag with the real numbers of its next move and then does exactly that; ward absorbs hits until its owner's next turn. Content (cards, foes, statuses) is plain data; a bot plays through the same input path.

**Parameters chosen:** `energy` = 3, `draw` = 5, `handMax` = 10, `fan` = 6, `speed` = 1, `intents` = on, `arrow` = on, `numbers` = on.

**Where it goes** (by role; find these places in my game):

1. *How your fight maps onto it (decide before coding):* Your attacks, skills and items become cards `{name, cost, type: 'attack'|'skill'|'charm', target: 'enemy'|'none', text: 'Deal {damage} damage.', effects: [{do: 'damage', n: 6}]}` (effects: damage / ward / status / draw / energy / heal, or a function using `api`); your monsters become foes `{name, hp, look, palette, moves: {id: {name, effects}}, pattern}`; the hero's deck is 8-12 card ids from its skills and items.
2. *Once, where your battle screen starts:* `battle = GameDNA_CardBattle.create({view: {x: 0, y: 0, w, h} (your logical canvas), cards, enemies, params: {energy: 3, draw: 5, handMax: 10, fan: 6, speed: 1, intents: 'on', arrow: 'on', numbers: 'on'}, drawBackground: (ctx, view, t) => <your backdrop>, onHit: ev => <your hit feedback>, onEnd: (result, info) => <your victory / defeat code, once>})`; at each encounter `battle.start({deck, foes, hero: {hp, maxHp, name}, seed})`.
3. *Your fixed step (every loop that steps the game, fast-forwards included):* `battle.update(stepMs)` once per step, `0` while your world is frozen; never behind a menu or animation check.
4. *Where your battle screen is drawn:* Replace drawing the combatants with `battle.drawScene(ctx)`, then your effects, then `battle.drawUI(ctx)`; keep your HUD, title and result screens after it.
5. *Your input while the fight runs:* Keys -> `battle.key('left'|'right'|'up'|'down'|'ok'|'back'|'end')`; pointer down / move / up -> `battle.pointer(type, x, y)` in logical px. Your autoplay -> `battle.setAuto(true)`.
6. *Where the fight ends:* In `onEnd(result, info)`: copy `info.hero.hp` to your hero, run your existing win / lose code exactly once, set any phase your other code and tests read.

**Common mistakes** (symptom -> fix):

- A foe deals more or less than its tag said -> something outside the rules changed HP or statuses during the fight; only cards, moves and statuses may.
- Card counts drift -> your code edits the hand or piles; add cards through `battle.addCard(id, where)`.
- Nothing happens after a click -> `update()` is skipped while a menu or animation runs; call it every step.
- Your old turn loop still runs -> stop calling your round function during a fight (keep the function).
- Different fight every reload -> pass a fixed `seed` per encounter; never use `Math.random` in card code or patterns (use `api.rng()`).
- Pointer play misses -> pass logical px (canvas css px scaled to your logical size), not page px.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Card battle with intents] A fanned hand; dragging an aimed card shows the arrow and a reticle on the foe; unpayable cards are dimmed.
- [Card battle with intents] Every foe shows an intent tag with numbers; after End Turn it does exactly that; a sapped foe's tag drops at once.
- [Card battle with intents] The discard pile reshuffles into the draw pile; ward absorbs ("blocked n"); your autoplay still finishes the game.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `card-battle.js` sha256 `c20c93fbec5f3273...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Card battle with intents] Trace one fight: start -> update each step -> play -> onHit per hit -> end turn -> foes act -> onEnd once -> your next screen.
- [Card battle with intents] Grep every place your game changes HP during a fight: none may run between start and onEnd.
- [Card battle with intents] Walk one hit: 6 + Might 2 = 8; target Exposed: 8 x 1.3 = 10.4 -> 10; ward 4 absorbs 4, HP -6.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.
