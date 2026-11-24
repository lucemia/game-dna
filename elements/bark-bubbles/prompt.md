# Add world-space bark bubbles to my game

Defaults (change any before pasting):
`{{cps}}` = 45 · `{{hold}}` = 1500 · `{{idle}}` = 7000 · `{{cooldown}}` = 4000 · `{{palette}}` = light · `{{render}}` = auto · `{{width}}` = 20

---

You are given `bark-bubbles.js` (a finished module, one global `GameDNA_BarkBubbles`) and its `README.md`. **Include the module verbatim** (`<script src>` before my game script, or pasted unchanged into its own `<script>`); never edit it. It draws short speech bubbles above characters that follow the speaker, avoid each other and the UI, and expire. It never pauses the game.

Add code; never delete or rename my functions.

**Integration points** (find these places in my game):

1. **Create one instance** once the canvas and my characters exist:
`barks = GameDNA_BarkBubbles.create({ bounds, getAnchor, getObstacles, speakers, params: { cps: {{cps}}, hold: {{hold}}, idle: {{idle}}, cooldown: {{cooldown}}, palette: '{{palette}}', render: '{{render}}', width: {{width}} } })`
   - All in **screen** pixels of my logical canvas (world minus camera, plus any HUD offset).
   - `bounds`: the visible play field (below/above a HUD strip).
   - `getAnchor(id)` → `{x, top, w, h}`: sprite centre x and head top, or `null` if gone.
   - `getObstacles()` → each living character's sprite rect (with its HP bar) and `id`, the player's with `hard: true`; plus every HUD panel and open window (dialogue, shop, menu) **without** `id`.
   - `speakers()` → `[{id, voice}]` of NPCs who may chat when idle while the map is shown; `[]` elsewhere. Voices: `villager`, `guard`, `merchant`, `hero`, `monster`, `critter`.
2. **Bark on events**, on the change, not every frame: `barks.bark(id, event, { voice })`.
   - An enemy starts chasing / notices the player: `'spotted'` (`'lost'` when it gives up).
   - Any character loses HP: `'hurt'` for that character (the player with voice `hero`). Player HP drops below 30 %: `'lowhp'`.
   - The player defeats a foe: `'kill'` for the player.
   - Talking to an NPC opens my dialogue: also call `barks.silence(npcId)`.
   - Exact lines: `barks.say(id, text, { tone })` (`talk`, `shout`, `alarm`, `hurt`, `whisper`, `think`).
3. **Update** in my fixed step: `barks.update(stepMs)`; `barks.update(0)` while my world is frozen or paused.
4. **Draw** once per frame after characters and effects, before HUD and windows, in screen coordinates: `barks.draw(ctx)` (inside a camera translate: `barks.draw(ctx, camX, camY)`). Never clip or filter it.
5. **Clear** on new game, restart and whenever my game switches to another screen (battle screen, title): `barks.clear()`. Return `null` anchors for characters not shown.

**Keep every other caller working**: autoplay (`?auto=1` must still finish with the same outcome), `?t=&freeze=1` (bubbles advance only through `update`), restart, pause, shortcuts. Never call my RNG for bubbles.

**Self-check without a browser**
- The module file is byte-identical to the one given.
- `barks` and everything the callbacks read exist before the first `bark`.
- Each `bark` sits where the change happens (hit function, the line that switches an enemy to chasing), guarded so it fires once per change.
- Walk one hit: HP change → `barks.bark(id, 'hurt', …)` → `update` → `draw` with screen coordinates that match where the sprite is drawn.

**Acceptance checks** 
1. An enemy that notices the player shows a yellow "!" bubble above it ; a hit shows a pink hurt bubble above the victim.
2. Bubbles follow walking speakers, never overlap each other, a HUD panel or a window, and fade after a few seconds.
3. A speaker at or past the screen edge keeps its bubble inside the screen with the tail pointing at it.
4. `?auto=1` plays to the end with no console errors and the same result as before.
