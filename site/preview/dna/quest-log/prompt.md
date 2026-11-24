# Add Quest log & objectives to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `quest-log.js` (one global, `GameDNA_QuestLog`), API reference `quest-log.README.md`

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Quest log & objectives [ui].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Quest log & objectives:** quest data: id, title, giver, description, reward, ordered steps with 'type:target' and a count; events from the code that decides them: start(questId), event('kill' | 'collect' | 'talk' | 'reach' | any word, target, n); the screen rect of the play view and the HUD rects to keep clear (dialogue boxes while open); optional: quiet() = true while a dialogue or cut-scene runs (banners wait), obstacles() = screen rects of NPCs / speakers to keep visible; a camera offset (optional); a fixed update step (also on the ?t= replay), a key for the log and arrow / confirm / cancel while it is open.

## Element 1: Quest log & objectives (`quest-log.js`, `GameDNA_QuestLog`)

Quests as data with ordered steps and counters: the game reports events and the module advances the current step, clamps counters to their targets and ignores events for later steps and after completion. A tracker card per quest in a HUD corner (objective, punching 2/3 counter, bar, check-off that strikes through and collapses), NEW QUEST / QUEST COMPLETE banners, a quest log panel (active and done tabs, description, steps, reward, track / untrack) and world markers with edge arrows. Never covers the HUD rects the game names; text never overlaps. Glass cards on HD canvases, crisp pixel cards on native pixel canvases.

**Parameters chosen:** `corner` = tr, `max` = 2, `theme` = dusk, `markers` = on, `dodge` = on, `banner` = on, `future` = hidden, `logKey` = J, `hold` = 1100, `render` = auto.

**Where it goes** (by role; find these places in my game):

1. *Quest data, once, near the game's other constants:* 1-3 quests that mirror the game's own goal chain: `{id, title, giver, desc, reward, kind: 'main' | 'side', steps: [{text, on: 'type:target', count}]}`, e.g. `{text: 'Defeat slimes', on: 'kill:slime', count: 3}`, `{text: 'Return to the elder', on: 'talk:elder'}`. Use the same words the event calls below use.
2. *Once at startup, before anything can call it (also before a ?t= fast-forward loop):* `quests = GameDNA_QuestLog.create({view, safeRects, quests: DATA, camera, locate, player, obstacles, quiet, params: {corner: 'tr', max: 2, theme: 'dusk', markers: 'on', banner: 'on', future: 'hidden', keyHint: 'J', hold: 1100, render: 'auto'}})`. With Toasts & unlock pop-ups toasts in the game, also pass `toasts: <its instance>` so NEW QUEST / QUEST COMPLETE become toast cards. `view` = the play view in logical canvas px; `safeRects()` = every HUD box on screen now (bars, objective line, dialogue boxes, menus, other overlays); `camera()` world rect on screen, `locate(target)` world point(s) of a target, `player()` player world point; `obstacles()` screen rects of NPCs / bosses banners must not hide; `quiet()` true while a dialogue or cut-scene runs (banners wait).
3. *The code that DECIDES each event, once each (never a per-frame check):* `quests.start(id)` where a quest is given (end of a dialogue); `quests.event('kill', kind)` where a foe dies; `quests.event('collect', kind)` on pickup; `quests.event('talk', npcId)` when a conversation ends; `quests.event('reach', placeId)` on arrival (or give the step `at` + `radius` and `player()`).
4. *Your fixed update step, every scene (also the ?t= replay):* `quests.update(stepMs)`.
5. *Your render, last: after world and HUD, outside any camera transform, in play scenes:* `quests.draw(ctx)`.
6. *Your key handler (before the game reads the key):* `J` -> `quests.input('log')`; while `quests.isLogOpen()` arrows / confirm / cancel -> `quests.input('up' | 'down' | 'left' | 'right' | 'ok' | 'back')` and nothing else (human input only; never the autoplay). Pointer: `if (quests.tap(x, y))` consume it.
7. *Where a new game starts:* `quests.reset()`.

**Common mistakes** (symptom -> fix):

- Counter never moves -> the step's `on` words differ from the `event(type, target)` call; use the same words.
- Counter jumps or counts every frame -> `event` sits in a per-frame check; call it where the kill / pickup happens.
- Tracker over the HP bar, the objective line or the dialogue box -> that box is missing from `safeRects()` (or given in backing-store px).
- Banners and check-offs frozen in `?t=` stills -> `update` is not in the replayed step.
- Arrow keys move the hero while the log is open -> route keys to `input()` first and stop when it returns true.
- Markers in the wrong place -> `camera` / `locate` return screen px; return world px.
- A NEW QUEST banner over an NPC -> return that NPC's screen rect from `obstacles()`.
- `?auto=1` ends differently -> the integration changed game logic or random numbers; the module only reads.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Quest log & objectives] Taking a quest shows a banner and a tracker card in the tr corner, never over a HUD or dialogue box.
- [Quest log & objectives] Each kill / pickup bumps the counter; a finished step checks off and the next appears; events for later steps or after completion change nothing.
- [Quest log & objectives] J opens the log; the player does not move while it is open; `?auto=1` ends exactly like before.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `quest-log.js` sha256 `5df1262b1853e8fb...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Quest log & objectives] Every step `on` matches a real `event(...)` call (grep both sides); `start` is called where each quest is given.
- [Quest log & objectives] `update` runs once per fixed step in every scene, also on the replay; `draw` runs last, once per frame.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.
