# Add Upgrade draft (pick 1 of 3) and Card illustrations to my game

Add the 2 game elements below to MY existing game, which you have not seen. Each is a finished module file given with this prompt:

- `upgrade-draft.js` (one global, `GameDNA_UpgradeDraft`), API reference `upgrade-draft.README.md`
- `card-art.js` (one global, `GameDNA_CardArt`), API reference `card-art.README.md`

README example names are placeholders.

## Where it goes in my game (my choice; follow it exactly)

- **Upgrade draft (pick 1 of 3):** Open the upgrade draft exactly: at every level-up, instead of the fixed stat bonus.

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Upgrade draft (pick 1 of 3) [systems], (2) Card illustrations [ui].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Upgrade draft (pick 1 of 3):** the one place in update logic where the moment happens (level-up, chest opened, wave cleared): open() there; a fixed bonus it used to give goes; the stat fields the game really reads, written by applyDelta(stat, amount) (and read by getStat for the card preview and read-back); key-down events (or polled left / right / confirm / reroll / skip edges) routed to the draft while busy(); a fixed 60 Hz update step; rectangles of UI to keep clear; optional: the game's autoplay flag; the game's save to store serialize(); a fallback upgrade for a maxed build.
- **Card illustrations:** a Upgrade draft (pick 1 of 3) upgrade draft (GameDNA_UpgradeDraft) whose draw call can be replaced by drawDraft, or the game's own card drawing for drawCard; each upgrade's art key: an art field, its id or a tag naming a pack key (blade, fire, frost, storm, guard, heart, speed, gold, magic, luck, poison, light, crit, arrow, regen); the game's boot moved into onReady (images loaded before the first step); the card image files: the shipped pack, or the designer's own set made with prompt.md.

## Element 1: Upgrade draft (pick 1 of 3) (`upgrade-draft.js`, `GameDNA_UpgradeDraft`)

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

## Element 2: Card illustrations (`card-art.js`, `GameDNA_CardArt`)

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

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Upgrade draft (pick 1 of 3)] at every level-up, instead of the fixed stat bonus: the world pauses, the cards deal in and flip, arrows move the lift, Z takes, R rerolls, X skips; the pick flies into the strip and the game resumes.
- [Upgrade draft (pick 1 of 3)] The card's numbers equal the change in the game's own stats and the next fight uses them; a maxed upgrade is never offered again; a restart starts with no upgrades; the cards never cover the HUD.
- [Upgrade draft (pick 1 of 3)] `?t=<ms>&freeze=1` gives the same frame every time; `?auto=1` still ends (same ending with `autoPick: skip`), no console errors.
- [Card illustrations] Every dealt upgrade card shows its painting under Upgrade draft (pick 1 of 3)'s chip, name, tags and text; the text stays readable; flip, tilt, dim and pick look as before.
- [Card illustrations] `?t=<ms>&freeze=1` with a draft open is identical twice and already shows the art; `?auto=1` ends as before with no console errors.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `upgrade-draft.js` sha256 `4febc24b780d59e9...`, `card-art.js` sha256 `8a1dae4af30b65e3...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Upgrade draft (pick 1 of 3)] Grep `open(`: once per event, in update logic; list every path to at every level-up, instead of the fixed stat bonus and confirm each reaches it. Grep `create(`: once.
- [Upgrade draft (pick 1 of 3)] Grep `update(`: every fixed step including while busy; the freeze loop calls that step; the busy gate sits before the autopilot. Every delta stat in the table is read somewhere else in the game.
- [Upgrade draft (pick 1 of 3)] Walk one draft with the defaults: `open()` -> fade 0.24 s -> 3 cards deal 0.09 s apart and flip -> about 1.1 s after `open()` Z takes the lifted card -> `applyDelta` per delta, then `onPick` -> fly 0.8 s -> fade 0.23 s -> `busy()` false -> the game continues as before.
- [Card illustrations] Modules byte-identical (card-art.js after upgrade-draft.js), loaded before the game script; every `cards/<key>.webp` used exists.
- [Card illustrations] Grep `draft.draw(`: none left, `drawDraft(` in its place; the old boot runs only from `onReady`; list each upgrade with its art key.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.
