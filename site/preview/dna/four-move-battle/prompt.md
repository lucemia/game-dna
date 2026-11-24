# Add Four-move menu battle with type matchups to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `four-move-battle.js` (one global, `GameDNA_FourMove`), API reference `four-move-battle.README.md`

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Four-move menu battle with type matchups [systems].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Four-move menu battle with type matchups:** creature list per side: id, name, level, types, hp, atk, def, spd, up to 4 moves; move table: name, type, power, accuracy, uses, optional status / heal / guard / drain effect; type table: strong / weak / none lists per type; a fixed 60 Hz update step; keys up / down / left / right / ok / back (and taps in native pixels); optional: sprites (front and back), backdrop, foe AI chooser, items.

## Element 1: Four-move menu battle with type matchups (`four-move-battle.js`, `GameDNA_FourMove`)

Replaces what happens inside one battle with a turn-based creature duel (one on one, or two on two): each creature has up to four moves with uses left and a type; a type chart doubles, halves or cancels damage and says so in the message box; priority, then speed, decides who moves first; accuracy, critical hits, burn / sleep / numb, guard, heal and drain moves; switching to a bench creature costs the turn; fainted creatures sink and the next one is sent out. The module owns turn resolution, the message queue, the menus and the classic battle screen (foe top-right on a platform with its info box, own creature bottom-left from behind, message box, 2x2 move menu with type and uses, draining HP bars). The game supplies creatures, moves, types, sprites and its backdrop.

**Parameters chosen:** `format` = single, `textSpeed` = normal, `advance` = auto, `drain` = normal, `hints` = on, `critRate` = 0.0625. (`res`: not used; your game keeps its own.)

**Where it goes** (by role; find these places in my game):

1. *How your battle maps onto it (decide before coding):* Each combatant of yours becomes a creature `{id, name, level, types, hp, maxHp, atk, def, spd, moves}` from your own stats; if your party fights together, one is out at a time and the others are the bench (two out with format single = double). One enemy group, wave or encounter = one battle; its enemies are the foe team and come out one after another. Commands become moves (at most four): the basic attack, each spell (MP cost -> uses: `max(1, floor(maxMp / cost))`), defend (`{kind: 'status', target: 'self', effect: {guard: true}, priority: 3}`), heals (`effect: {heal: 0.4}`), group spells (`target: 'allFoes'`). Elements become types with `strong` / `weak` / `none` lists (invent 3-6 if you have none) and every foe gets one. Items stay items (`items()` / `useItem()`). To keep your damage balance, pass `damage(ctx)` returning your own formula times `ctx.eff` (and 1.5 on `ctx.crit`).
2. *Where a battle (or wave) starts, after its combatants exist:* `battle = GameDNA_FourMove.create({view: {x: 0, y: 0, w, h} (the full native canvas), seed, foeName, teams: {own, foe}, moves, types, sprite: (src, view) => <your sprite image of that combatant>, drawBackground: (ctx, rect, t) => <your battle backdrop>, onEnd: (result, snapshot) => ..., params: {format: 'single', textSpeed: 'normal', advance: 'auto', drain: 'normal', hints: 'on', critRate: 0.0625, auto: <your autoplay flag>}})`. Keep a reference to your own object in each creature (any extra field comes back as `src`). The same image for the `back` view is fine; mirror it if it faces away from the foe.
3. *Your fixed step (every loop that steps the game, fast-forwards included):* `battle.update()` once per step while a battle exists, as its own statement; never behind a menu or animation check. Also keep it running behind your end-of-battle overlay so the last HP bar finishes draining.
4. *Where your battle screen is drawn:* Replace the drawing of combatants, menus and the HP panel with `battle.draw(ctx)` (or `drawScene` + your effects + `drawUI`). Keep your own title, banners and result overlays, drawn after it.
5. *Your input handling while a battle runs:* Keys go to `battle.key('up' | 'down' | 'left' | 'right' | 'ok' | 'back')`, taps to `battle.tap(x, y)` in native pixels. Keep every other key and shortcut working.
6. *Where your battle ends (victory, next wave, defeat):* From `onEnd(result, snapshot)`: copy HP (and spent uses back into MP, if you mapped them) from `snapshot.own[i]` (`src` is your object), then run your existing victory / next-wave / defeat code exactly once. Set any phase or state that your other code (and tests) read.
7. *Your autoplay / demo player:* Pass `params.auto` (or call `battle.setAuto(true)`): the module plays your side by pressing its own menu keys and advances messages. Remove only the battle-command branch of your autoplay; keep its title and between-battle presses.

**Common mistakes** (symptom -> fix):

- Enemies never act or the battle freezes on a message -> `update()` is skipped while something else is busy; call it every step.
- Your old turn loop still runs and both systems act -> stop calling your round/turn function inside a battle (keep the function itself).
- HP resets between waves or your wave counter never moves -> copy HP back in `onEnd` and call your own end-of-battle code there, once.
- Autoplay hangs on the first menu -> it waits for your old command phase; pass `params.auto` instead.
- One side always wins in a few hits -> your type lists double damage against most of one side; give each side some strong and some weak matchups, or pass `damage(ctx)` with your own formula.
- Tiny sprites -> they are scaled up by whole numbers automatically; pass a sprite per creature, not a sheet.
- Blank text box on the first frame of a `?t=` still -> pass `view`; it is needed before the first draw.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Four-move menu battle with type matchups] Foe top-right on a platform with name / level / HP box, own creature bottom-left, message box; FIGHT opens a 2x2 move menu with type and uses.
- [Four-move menu battle with type matchups] A strong-type hit shows its matchup message, HP drains smoothly, a fainted creature sinks and the next one is sent out; uses count down; switching costs the turn.
- [Four-move menu battle with type matchups] Your autoplay still finishes the whole game and ends the same way as before; restart and title still work.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `four-move-battle.js` sha256 `415a54b67540fc88...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Four-move menu battle with type matchups] Trace one turn: OK -> FIGHT -> a move -> both sides act in speed order -> the menu returns.
- [Four-move menu battle with type matchups] Trace the last foe fainting: `onEnd('win')` -> your next battle or victory runs once; your last creature fainting -> defeat once.
- [Four-move menu battle with type matchups] Every function that existed still exists; every move id in a creature's `moves` exists in `moves`.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.
