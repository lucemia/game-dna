# Add Branching run map, Card battle with intents, Upgrade draft (pick 1 of 3), Card illustrations and Toasts & unlock pop-ups to my game

Add the 5 game elements below to MY existing game, which you have not seen. Each is a finished module file given with this prompt:

- `run-map.js` (one global, `GameDNA_RunMap`), API reference `run-map.README.md`
- `card-battle.js` (one global, `GameDNA_CardBattle`), API reference `card-battle.README.md`
- `upgrade-draft.js` (one global, `GameDNA_UpgradeDraft`), API reference `upgrade-draft.README.md`
- `card-art.js` (one global, `GameDNA_CardArt`), API reference `card-art.README.md`
- `toasts.js` (one global, `GameDNA_Toasts`), API reference `toasts.README.md`

README example names are placeholders.

## Where it goes in my game (my choice; follow it exactly)

- **Branching run map:** The run map wraps the game's existing play: battle = one of my normal fights, elite = a tougher fight, boss = my final fight.
- **Upgrade draft (pick 1 of 3):** Open the upgrade draft exactly: at every level-up, instead of the fixed stat bonus.

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Branching run map [systems], (2) Card battle with intents [systems], (3) Upgrade draft (pick 1 of 3) [systems], (4) Card illustrations [ui], (5) Toasts & unlock pop-ups [ui].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Branching run map:** the place where a fight (or room, wave) starts, called from onEnter for battle / elite / boss nodes, scaled by node.tier and node type; every place where that fight is decided (won, lost, fled): run.finish({won}); the place where a new game starts: run.start(); the stats rest / shop / event choices change (HP, max HP, attack, coins), written by the designer's apply functions; a fixed update step (the map's only clock), also while the world is paused for it; key-down events or polled edges; pointer in native px; the play field size in native px and HUD rects to keep clear; the autoplay flag.
- **Card battle with intents:** a deck (list of card ids) and the foes of an encounter (enemy ids), the hero's HP / max HP; card, foe and status tables (built-ins ship; the game adds its own as plain data); a fixed 60 Hz update step; key or pointer input routed to the battle while it runs; a place to go when the fight ends (win / lose) and, optionally, a reward screen.
- **Upgrade draft (pick 1 of 3):** the one place in update logic where the moment happens (level-up, chest opened, wave cleared): open() there; a fixed bonus it used to give goes; the stat fields the game really reads, written by applyDelta(stat, amount) (and read by getStat for the card preview and read-back); key-down events (or polled left / right / confirm / reroll / skip edges) routed to the draft while busy(); a fixed 60 Hz update step; optional: the game's autoplay flag; the game's save to store serialize(); a fallback upgrade for a maxed build.
- **Card illustrations:** a Upgrade draft (pick 1 of 3) upgrade draft (GameDNA_UpgradeDraft) whose draw call can be replaced by drawDraft, or the game's own card drawing for drawCard; each upgrade's art key: an art field, its id or a tag naming a pack key (blade, fire, frost, storm, guard, heart, speed, gold, magic, luck, poison, light, crit, arrow, regen); the game's boot moved into onReady (images loaded before the first step); the card image files: the shipped pack, or the designer's own set made with prompt.md.
- **Toasts & unlock pop-ups:** game events worth announcing (pickups, purchases, loot, quest steps, unlocks, level-ups, firsts), at the code that decides them; a fixed update step that runs in every scene, menus open included (also run by ?t= fast-forward); the screen size in logical px (bounds); the rects of the HUD panels, minimap, message lines, captions, banners and open windows on screen now.

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

## Element 2: Card battle with intents (`card-battle.js`, `GameDNA_CardBattle`)

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

## Element 3: Upgrade draft (pick 1 of 3) (`upgrade-draft.js`, `GameDNA_UpgradeDraft`)

The roguelite "pick 1 of 3": `open()` at the chosen moment pauses the world and deals upgrade cards (fan-in, flip, rarity glow); the player moves between them and takes one (synergy hints for shared tags, optional reroll and skip), and the pick flies into an owned-upgrades strip. Upgrades are a plain table in the game (`{id, name, rarity, tags, text with {value}, max, delta: {stat: amount}}` or a small `apply(target)`); hands are seeded by the module, rarity-weighted, without duplicates or maxed entries. The module never changes the game itself: picks arrive through the game's `applyDelta(stat, amount)`, the table's `apply` and `onPick`, synchronously inside `update()`. While `busy()` the world waits and input goes to the draft; autoplay picks by itself (`autoPick`).

**Open the upgrade draft exactly: at every level-up, instead of the fixed stat bonus.**

**Parameters chosen:** `seed` = 1, `choices` = 3, `rerolls` = 1, `skip` = on, `wCommon` = 60, `wRare` = 30, `wEpic` = 10, `maxStacks` = 5, `look` = auto, `autoPick` = rarest, `strip` = draft, `dim` = 0.55.

**Where it goes** (by role; find these places in my game):

1. *Game data, next to the player's stats:* An upgrade table of 10-16 entries with original neutral-fantasy names: `{id, name, rarity: 'common'|'rare'|'epic', tags, text: '... {value} ...', max, delta: {<stat field>: amount}}` (about 6 common, 6 rare, 3 epic; tags from `blade fire frost storm guard heart speed gold magic luck poison light crit arrow regen`, shared tags = synergy) and a `fallback` entry (e.g. a heal) for a maxed build. Deltas use only stat fields the game reads; a new stat needs code that reads it.
2. *Once, after the screen size and HUD layout exist (one instance for the whole run):* `draft = GameDNA_UpgradeDraft.create({view: {w, h}, upgrades: UPGRADES, fallback: FALLBACK, params: {seed: 1, choices: 3, rerolls: 1, skip: 'on', wCommon: 60, wRare: 30, wEpic: 10, maxStacks: 5, look: 'auto', autoPick: 'rarest', strip: 'draft', dim: 0.55}, applyDelta: (stat, amount) => <add amount to the field combat reads; for max HP also current HP>, getStat: stat => <that field>, target: () => <player>, statLabels: {<stat>: 'ATK'}, autoplay: () => <autoplay flag>, uiRects: () => [HUD bars]})`.
3. *The ONE place in update logic where the moment happens (at every level-up, instead of the fixed stat bonus). Grep every path that reaches it:* `draft.open({title: 'LEVEL UP'})` once per event (two level-ups in one step: call it twice; the module queues). A fixed bonus that used to be given there, and the message announcing it, go; level, XP and heals stay. Code that must wait for the choice moves into `open({onDone: r => ...})`. **With Level-up stat growth level-up growth in the same basket**, chain them: keep its results window, and in its `award(..., {onDone: r => ...})` call `draft.open()` once per level gained (`r.units` toLevel - fromLevel), so the tally shows first and the cards follow; or let the draft replace the stat growth (Level-up stat growth `minGain: 0` with `{rates: {}}` per class) when every gain should be a choice.
4. *Top of your fixed update step (the one the animation loop, the `?t=&freeze=1` fast-forward and autoplay all call), before the world and the autopilot:* `if (draft.busy()) { draft.update(1000 / 60); return; }` (keep reading / clearing the game's own input first if it buffers taps). When the draft opens or closes, clear only buffered taps; never clear held movement keys; when not busy: `draft.update(1000 / 60)` once per step. Pause / restart keys stay outside the gate.
5. *Key handler; pointer handler if the game has one:* First line of keydown: `if (draft.key(e.code, true)) { e.preventDefault(); return; }`; keyup: `draft.key(e.code, false)` (it returns false for keys it does not use and for every key when no draft is open). Games that poll an input object instead: `draft.press('left' | 'right' | 'confirm' | 'reroll' | 'skip')` on key-down edges inside the step. Pointer: while `busy()`, `draft.pointer(x, y, down)` in native px.
6. *Your draw pass:* Hide the game's own one-line notice (level-up message, toast) while `draft.busy()`. `draft.draw(ctx)` last, after the HUD and the game's own windows, under the same canvas transform as the HUD (HD games that scale for devicePixelRatio: after `setTransform`), outside any shake translate.
7. *New game / restart; save and load if the game has them:* `draft.reset()` next to the game's reset (the game restores its own base stats); `draft.serialize()` / `draft.restore()` next to the stats in the save.

**Common mistakes** (symptom -> fix):

- The card says +2 but combat is unchanged -> `applyDelta` writes a copy or a field nothing reads; write where the formulas read (the console warns when `getStat` disagrees).
- A new stat (crit, thorns, magnet, speed) does nothing -> add the code that reads it, or leave that entry out of the table.
- A restart keeps the upgrades -> `reset()` at restart, and base stats come from the game's start data, not a template `applyDelta` changed.
- The world, enemies or the autopilot move under the cards -> gate the whole fixed step on `busy()` before the autopilot.
- `?auto=1` hangs on the cards -> pass the autoplay flag as `autoplay` and keep `update` in the fixed step the freeze loop calls.
- `?auto=1` ends differently -> the player got stronger; that is allowed if it still ends. `autoPick: skip` keeps the original ending; say which in your notes.
- The same hand every time, or maxed upgrades return -> the draft was re-created per event; create it once.
- The old fixed-bonus message still shows under the title -> remove it; the draft replaces the bonus.
- Cards cover the HUD -> return the HUD bars from `uiRects()`; the cards lay out between them.

## Element 4: Card illustrations (`card-art.js`, `GameDNA_CardArt`)

Painted card illustrations (pre-generated 2:3 image files, one per upgrade theme) inside the Upgrade draft (pick 1 of 3) upgrade-draft cards: `cardArt.drawDraft(ctx, draft)` replaces `draft.draw(ctx)` and paints each card face full-bleed under Upgrade draft (pick 1 of 3)'s own chip, name, tags and text; Upgrade draft (pick 1 of 3) itself is unchanged. Also `drawCard(ctx, {title, cost, type, text, rarity, art}, {x, y, w})`, a code-drawn card frame with live text, for hands and reward screens. The game never calls an image generator.

**Parameters chosen:** `shade` = 0.9, `focusY` = 0.28, `textMin` = 5.2, `sheen` = on.

**Where it goes** (by role; find these places in my game):

1. *Read first: the upgrade table, every `draft.draw(` call and its transform, the boot (first step, the `?t=` fast-forward, the first animation frame), restart:* Each upgrade gets the picture that shows what it does: `art: '<key>'`, or a first tag that is a key. Pack keys: `blade` sword, `fire` brazier flame, `frost` ice crystals, `storm` lightning rod, `guard` round shield, `heart` glowing heart-shaped seed pod, `speed` winged boots, `gold` coin pouch, `magic` glowing book, `luck` clover charm, `poison` green flask, `light` golden feather, `crit` eye amulet, `arrow` bow and arrows, `regen` sprout in a pot. Never change names, texts, rarities or deltas.
2. *After the draft is created (a NEW top-level name: grep it first):* `const cardArt = GameDNA_CardArt.create({src: 'cards/{key}.webp', upgrades: <the same table>, params: {shade: 0.9, focusY: 0.28}})`.
3. *Every `draft.draw(ctx…)` in the draw pass:* Becomes `cardArt.drawDraft(ctx, draft…)`: same place, same arguments after `ctx`, same transform. No second `draft.draw` in the frame.
4. *The boot:* Replace the old boot call with `cardArt.onReady(boot)` (boot = the old start code, unchanged). If another asset element already gates the boot, chain them: `por.onReady(() => cardArt.onReady(boot))`.

**Common mistakes** (symptom -> fix):

- Cards still show Upgrade draft (pick 1 of 3)'s round icons -> a `draft.draw(` is left in the frame, or no upgrade resolves to a key (give `art`).
- Frozen shots (`?t=&freeze=1`) without art -> the boot still runs directly; boot only from `cardArt.onReady(boot)`.
- Ghost or doubled cards -> both `draft.draw` and `drawDraft` run; keep only `drawDraft`.
- Pixel cards (a field under 300 px tall) have no art: generated art is for HD looks; that is expected.
- The hero stops after a draft until the key is pressed again -> the game's held movement keys were cleared when the draft opened or closed; leave them alone.
- `Identifier ... has already been declared` -> the game already has that name; pick a new one.

## Element 5: Toasts & unlock pop-ups (`toasts.js`, `GameDNA_Toasts`)

Achievement, quest-update and item-get notices slide in from a screen edge, stack and glide, leave on a timer line, merge duplicates into one card with a punching ×N badge (quest progress updates one card in place), and queue behind a "+N more" chip. They keep a safe-area margin, step around every HUD rect the game reports, hide while a window covers their slot and come back after, and never pause the game. Glass cards on HD canvases, crisp pixel cards with built-in bitmap fonts on native pixel canvases.

**Parameters chosen:** `edge` = top-right, `max` = 3, `hold` = 2800, `merge` = on, `enter` = slide, `size` = 0, `margin` = 0, `theme` = dusk, `progress` = on, `more` = on, `render` = auto.

**Where it goes** (by role; find these places in my game):

1. *Once at startup, after the canvas size is known (before anything can push):* `toasts = GameDNA_Toasts.create({bounds: {x: 0, y: 0, w: SCREEN_W, h: SCREEN_H}, uiRects, params: {edge: 'top-right', max: 3, hold: 2800, merge: 'on', enter: 'slide', theme: 'dusk', progress: 'on', render: 'auto'}})`. `bounds` = the screen in logical canvas px (not the backing store). `uiRects()` returns `{x, y, w, h}` for every HUD panel, minimap, objective or message line, caption, banner and open window drawn right now, using the draw code's numbers. If units stand under the stack's corner (a battle party, a tactics grid), also return their formation box so cards never hide them.
2. *The code that DECIDES each event a player cares about (pickup, purchase, loot, quest step, unlock, level-up, first kill, boss beaten, low HP). Pick 4-8; never a per-frame condition:* `toasts.push(kind, title, {text, key, count, rarity, icon})`: kinds `achievement | quest | item | unlock | level | info | warning`. Item icons `leaf | potion | pouch | sword | coin | gem | heart | star`; items merge to ×N by title; amounts with `'+{n} Coins'` and `{key: 'coins', count: n}`; quest progress only when the objective count changes, one fixed `key` per quest, `text: 'done / need'`, `count: 0`. If the game draws a one-line notice for that event ("Bought X"), stop drawing only that line (keep its variables); phase banners, titles, captions and result screens ("WAVE CLEARED", "VICTORY") stay.
3. *Your fixed update step, at the top, for every scene (title, play, menus open, end screens):* `toasts.update(stepMs)`.
4. *Your draw pass, last: after world, effects, HUD and windows, in screen coordinates outside any camera translate:* `toasts.draw(ctx)` once per frame, every scene.
5. *New game / restart:* `toasts.clear(true)`.

**Common mistakes** (symptom -> fix):

- Cards over the HUD or a window -> that rect is missing from `uiRects()` (or given in backing-store px).
- Cards never show, or only after a menu closes -> `update()` is only called in the play scene; call it every step.
- A badge counting up every frame, or a wall of identical cards -> `push` sits in a per-frame check.
- Two messages per event -> the game's own one-line notice is still drawn (only that line goes; banners and result titles stay).
- Cards hide the party on a small battle screen -> return the party formation box from `uiRects()`, or pick an edge over empty background.
- The quest card reappears on every kill -> push quest progress only when its count changes.
- Quest progress shows ×2, ×3 -> push it with `count: 0` and a fixed `key`.
- Blurry text on a native pixel game drawn into a larger backing store -> `render: 'crisp'`.
- `?auto=1` ends differently -> a push changed game state or consumed the game's random numbers.

## Cross-element wiring

**Branching run map with Card battle with intents:**

- **UI rects:** `battle.uiRects()` lists the hero panel, piles, end-turn button, readout, banner, hand cards and intent tags of the last drawn frame (no tags before a fight's first frame, e.g. in a `?t=` fast-forward), so also reserve each intent tag live: for each `f` of `battle.foes()` with `f.hp > 0 && battle.intentOf(f.id)`, `a = battle.anchor(f.id)`, `tip = max(a.top - 4k, view.y + 64k)`, rect `{x: a.x - 50k, y: tip - 34k, w: 100k, h: 36k}` with `k = view.h / 360` (`intentRects()` in the module README). Return them from the run map's `uiRects()`, so the map sheet and its floor badge never cover them.

**Branching run map with Upgrade draft (pick 1 of 3):**

- **UI rects:** `draft.rect()` is the open draft (the whole field while busy), or null; while it is open other overlays should wait or stay hidden. Return them from the run map's `uiRects()`, so the map sheet and its floor badge never cover them.

**Upgrade draft (pick 1 of 3) with Branching run map:**

- **UI rects:** `run.rect()` is the open map sheet, or null; while it is open other overlays should wait or stay hidden. Return them from the draft's `uiRects()`, so the cards and the strip never cover them.
- **reset:** Fights now start from the run map's `onEnter(node)` (`node.type` battle / elite / boss, `node.tier` 0..1). Do NOT call `draft.reset()` at every battle or level start (the build must carry over); only at a new run.

**Upgrade draft (pick 1 of 3) with Card battle with intents:**

- **UI rects:** `battle.uiRects()` lists the hero panel, piles, end-turn button, readout, banner, hand cards and intent tags of the last drawn frame (no tags before a fight's first frame, e.g. in a `?t=` fast-forward), so also reserve each intent tag live: for each `f` of `battle.foes()` with `f.hp > 0 && battle.intentOf(f.id)`, `a = battle.anchor(f.id)`, `tip = max(a.top - 4k, view.y + 64k)`, rect `{x: a.x - 50k, y: tip - 34k, w: 100k, h: 36k}` with `k = view.h / 360` (`intentRects()` in the module README). Return them from the draft's `uiRects()`, so the cards and the strip never cover them.
- **reset:** A fight starts at `battle.start({...})`. Do NOT call `draft.reset()` at every battle or level start (the build must carry over); only at a new run.

**Card illustrations with Branching run map:**

- **reset:** Fights now start from the run map's `onEnter(node)` (`node.type` battle / elite / boss, `node.tier` 0..1). Nothing to reset: the art instance lives for the whole game (never re-create it at a level start).

**Card illustrations with Card battle with intents:**

- **reset:** A fight starts at `battle.start({...})`. Nothing to reset: the art instance lives for the whole game (never re-create it at a level start).

**Toasts & unlock pop-ups with Branching run map:**

- **UI rects:** `run.rect()` is the open map sheet, or null; while it is open other overlays should wait or stay hidden. Return the other elements' windows, banners, plates and HUD from `uiRects()`; toasts step around them and hide while a window covers their slot.
- **reset:** Fights now start from the run map's `onEnter(node)` (`node.type` battle / elite / boss, `node.tier` 0..1). Call `toasts.clear(true)` only on a new game, not per battle or wave.

**Toasts & unlock pop-ups with Card battle with intents:**

- **UI rects:** `battle.uiRects()` lists the hero panel, piles, end-turn button, readout, banner, hand cards and intent tags of the last drawn frame (no tags before a fight's first frame, e.g. in a `?t=` fast-forward), so also reserve each intent tag live: for each `f` of `battle.foes()` with `f.hp > 0 && battle.intentOf(f.id)`, `a = battle.anchor(f.id)`, `tip = max(a.top - 4k, view.y + 64k)`, rect `{x: a.x - 50k, y: tip - 34k, w: 100k, h: 36k}` with `k = view.h / 360` (`intentRects()` in the module README). Return the other elements' windows, banners, plates and HUD from `uiRects()`; toasts step around them and hide while a window covers their slot.
- **reset:** A fight starts at `battle.start({...})`. Call `toasts.clear(true)` only on a new game, not per battle or wave.

**Toasts & unlock pop-ups with Upgrade draft (pick 1 of 3):**

- **UI rects:** `draft.rect()` is the open draft (the whole field while busy), or null; while it is open other overlays should wait or stay hidden. Return the other elements' windows, banners, plates and HUD from `uiRects()`; toasts step around them and hide while a window covers their slot.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Branching run map] A new game opens the map; arrows / mouse / touch move between connected nodes only; Z travels; the route is drawn in gold and paths never cross.
- [Branching run map] battle = one of my normal fights, elite = a tougher fight, boss = my final fight: each fight node plays the game's fight and the map returns one floor higher; rest / shop / event choices change the game's real stats; the boss ends the run with the game's own ending.
- [Branching run map] `?t=<ms>&freeze=1` gives the same frame every time; `?auto=1` still ends, no console errors.
- [Card battle with intents] A fanned hand; dragging an aimed card shows the arrow and a reticle on the foe; unpayable cards are dimmed.
- [Card battle with intents] Every foe shows an intent tag with numbers; after End Turn it does exactly that; a sapped foe's tag drops at once.
- [Card battle with intents] The discard pile reshuffles into the draw pile; ward absorbs ("blocked n"); your autoplay still finishes the game.
- [Upgrade draft (pick 1 of 3)] at every level-up, instead of the fixed stat bonus: the world pauses, the cards deal in and flip, arrows move the lift, Z takes, R rerolls, X skips; the pick flies into the strip and the game resumes.
- [Upgrade draft (pick 1 of 3)] The card's numbers equal the change in the game's own stats and the next fight uses them; a maxed upgrade is never offered again; a restart starts with no upgrades; the cards never cover the HUD.
- [Upgrade draft (pick 1 of 3)] `?t=<ms>&freeze=1` gives the same frame every time; `?auto=1` still ends (same ending with `autoPick: skip`), no console errors.
- [Card illustrations] Every dealt upgrade card shows its painting under Upgrade draft (pick 1 of 3)'s chip, name, tags and text; the text stays readable; flip, tilt, dim and pick look as before.
- [Card illustrations] `?t=<ms>&freeze=1` with a draft open is identical twice and already shows the art; `?auto=1` ends as before with no console errors.
- [Toasts & unlock pop-ups] An event shows one card sliding in from the chosen edge (label, title, icon); it leaves by itself.
- [Toasts & unlock pop-ups] The same item three times shows one card with ×3; quest progress updates one card.
- [Toasts & unlock pop-ups] A burst of five events shows `max` cards plus "+N more"; the rest follow. No card covers HUD, windows or another card; the game never pauses for a toast.
- [combined] The map sheet and the floor badge never cover the other element's windows, plates or HUD.
- [combined] The map sheet and the floor badge never cover the other element's windows, plates or HUD.
- [combined] The cards and the owned strip never cover the other element's windows, plates or HUD.
- [combined] The cards and the owned strip never cover the other element's windows, plates or HUD.
- [combined] No toast covers the other element's windows, banners or HUD.
- [combined] No toast covers the other element's windows, banners or HUD.
- [combined] No toast covers the other element's windows, banners or HUD.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `run-map.js` sha256 `5a27425b684890c3...`, `card-battle.js` sha256 `c20c93fbec5f3273...`, `upgrade-draft.js` sha256 `4febc24b780d59e9...`, `card-art.js` sha256 `8a1dae4af30b65e3...`, `toasts.js` sha256 `25c4b74cf2a237cb...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Branching run map] Grep `start(`: at every new game. Grep `finish(`: on every path out of a fight that `onEnter` starts. Grep `create(`: once.
- [Branching run map] Grep `update(`: every fixed step including while busy; the busy gate sits before the autopilot.
- [Branching run map] Walk one floor: `start()` -> fade 0.32 s -> about 0.9 s later (autoplay) or Z -> travel 0.62 s -> `onEnter(battle)` -> fade 0.26 s -> the fight -> `finish({won: true})` -> the map reopens with that node checked.
- [Card battle with intents] Trace one fight: start -> update each step -> play -> onHit per hit -> end turn -> foes act -> onEnd once -> your next screen.
- [Card battle with intents] Grep every place your game changes HP during a fight: none may run between start and onEnd.
- [Card battle with intents] Walk one hit: 6 + Might 2 = 8; target Exposed: 8 x 1.3 = 10.4 -> 10; ward 4 absorbs 4, HP -6.
- [Upgrade draft (pick 1 of 3)] Grep `open(`: once per event, in update logic; list every path to at every level-up, instead of the fixed stat bonus and confirm each reaches it. Grep `create(`: once.
- [Upgrade draft (pick 1 of 3)] Grep `update(`: every fixed step including while busy; the freeze loop calls that step; the busy gate sits before the autopilot. Every delta stat in the table is read somewhere else in the game.
- [Upgrade draft (pick 1 of 3)] Walk one draft with the defaults: `open()` -> fade 0.24 s -> 3 cards deal 0.09 s apart and flip -> about 1.1 s after `open()` Z takes the lifted card -> `applyDelta` per delta, then `onPick` -> fly 0.8 s -> fade 0.23 s -> `busy()` false -> the game continues as before.
- [Card illustrations] Modules byte-identical (card-art.js after upgrade-draft.js), loaded before the game script; every `cards/<key>.webp` used exists.
- [Card illustrations] Grep `draft.draw(`: none left, `drawDraft(` in its place; the old boot runs only from `onReady`; list each upgrade with its art key.
- [Toasts & unlock pop-ups] List each `push` with the event behind it; none runs every frame while a condition holds.
- [Toasts & unlock pop-ups] `uiRects()` covers every HUD element and window for every scene, in logical px; `update` runs every step, `draw` last.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.
