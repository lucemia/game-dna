# Add quests, a quest tracker and a quest log to my game

Defaults (change any before pasting):
`{{corner}}` = tr · `{{max}}` = 2 · `{{theme}}` = dusk · `{{markers}}` = on · `{{logKey}}` = J

---

You are given `quest-log.js` (finished module, global `GameDNA_QuestLog`) and its `README.md`. **Include the module verbatim** (`<script src>` before my game script, or pasted unchanged into its own `<script>`). It owns quest progress and drawing; my game only reports events.

Player sees: tracker cards in the `{{corner}}` corner (objective, counter 2/3, check-offs), NEW QUEST / QUEST COMPLETE banners, a diamond over the current target (edge arrow when off screen), a quest log on `{{logKey}}`.

Add code; never delete or rename my functions, state, URL parameters or keys.

**Integration points** (find these places in my game):

1. **Quest data**: turn my game's existing goals into 1-3 quests with ordered steps, e.g. `{ id, title, giver, desc, reward, kind: 'main', steps: [{ text: 'Defeat slimes', on: 'kill:slime', count: 3 }, { text: 'Return to the elder', on: 'talk:elder' }] }`. Mirror my existing goal chain.
2. **Create one instance** once, before anything can call it (also before a `?t=` fast-forward loop):
`quests = GameDNA_QuestLog.create({ view, safeRects, quests: DATA, camera, locate, player, obstacles, quiet, params: { corner: '{{corner}}', max: {{max}}, theme: '{{theme}}', markers: '{{markers}}', keyHint: '{{logKey}}' } })`
   - `view`: the screen rect of my play view in logical canvas px (what `draw` gets, not the backing store).
   - `safeRects()`: every HUD box on screen now (bars, objective text, dialogue boxes, menus).
   - `camera()`: world rect on screen; `locate(target)`: world `{x, y}` (or a list) of that target; `player()`: player world `{x, y}`. All world px. Optional: `obstacles()` (NPC screen rects), `quiet()` (true while a dialogue is open).
3. **Report events** where my game decides them, once each: `quests.start(id)` when a quest is given (usually at the end of a dialogue), `quests.event('kill', kind)`, `quests.event('collect', kind)`, `quests.event('talk', npcId)`, `quests.event('reach', placeId)`.
4. **Update** every fixed step, every scene, also in the `?t=` fast-forward: `quests.update(stepMs)`.
5. **Draw** last, after world and HUD, outside any camera transform, in play scenes: `quests.draw(ctx)`.
6. **Keys**: `{{logKey}}` -> `quests.input('log')`. While `quests.isLogOpen()`, send arrows / confirm / cancel as `'up' 'down' 'left' 'right' 'ok' 'back'` to `quests.input` and nowhere else; pause only human play meanwhile. Pointer: `if (quests.tap(x, y))` consume it.
7. **Restart**: `quests.reset()` where a new game starts.

**Keep every other caller working**: `?auto=1` must end exactly like before (the module never touches game state or random numbers); `?t=&freeze=1`, restart, pause, every key and tap keep working. Keep my own objective variables; if my HUD already draws an objective line, keep it and list it in `safeRects()`.

**Self-check without a browser**
- The module file is byte-identical and loads first; `quests` exists before the first `update`, `event` or `draw`.
- Each step's `on` words match a real `event(...)` call (grep both sides).
- Every HUD rect drawn in play is in `safeRects()`, same coordinates as `view`.
- Walk one example: step `{on: 'kill:slime', count: 3}`; three kills -> 3/3, next step starts at 0; a fourth kill changes nothing.

**Acceptance checks** (screenshots if you can)
1. Taking a quest shows a banner and a tracker card, never over a HUD or dialogue box.
2. Each kill / pickup bumps the counter; a finished step checks off and the next appears; events for later steps do nothing.
3. Finishing shows QUEST COMPLETE; later events change nothing.
4. `{{logKey}}` opens the log; keys do not move the player meanwhile.
5. `?auto=1` plays to the end with no console errors and the same result.
