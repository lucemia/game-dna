Defaults: `{{dirs}}` = 4, `{{combo}}` = 3, `{{reach}}` = 22, `{{arc}}` = 150, `{{antic}}` = 4, `{{active}}` = 4, `{{recover}}` = 10, `{{buffer}}` = 12, `{{knockback}}` = 3, `{{friction}}` = 0.8, `{{iframes}}` = 60, `{{hitstop}}` = 4, `{{telegraph}}` = 24, `{{enemySpeed}}` = 1, `{{hearts}}` = 3, `{{overlay}}` = off

---

Give my game **real-time sword combat on the map**, using the module `sword-combat.js` and its `README.md` given with this prompt. The module owns swings, hitboxes, combos, knockback, i-frames, enemy behaviours, damage, hearts and drops. My game keeps its map, walls, hero, walking, scenes, quests, dialogue and HUD.

**1. Include the module verbatim** in its own `<script>` before my game script; never edit it. Its only global is `GameDNA_SwordCombat`.

**2. Integration points** (by role):
- **Once, when the game or a new game starts:** `sc = GameDNA_SwordCombat.create({player: <my hero object, feet box {x, y, w, h} in world px>, playerId: <my hero's id>, solid: (x, y, w, h) => <my wall test, including NPCs and chests>, bounds: <the area enemies may roam>, seed, hp: {get, set, max} <my own HP variables>, onHit, onDefeat, onPlayerDown, params: {dirs: {{dirs}}, combo: {{combo}}, reach: {{reach}}, arc: {{arc}}, antic: {{antic}}, active: {{active}}, recover: {{recover}}, buffer: {{buffer}}, knockback: {{knockback}}, friction: {{friction}}, iframes: {{iframes}}, hitstop: {{hitstop}}, telegraph: {{telegraph}}, enemySpeed: {{enemySpeed}}, hearts: {{hearts}}, overlay: '{{overlay}}'}})`.
- **Where my enemies are created:** `sc.spawn({id, brain, look, x, y, hp})` instead, keeping their ids and positions. Pick a brain per enemy role (roamer `wander`, pursuer `chase`, rusher `charge`, ranged `shooter`, boss `warden`). Rooms or levels: `sc.clear()`, then spawn.
- **My old combat** (a separate battle screen, touch-to-fight trigger, old enemy AI): stop entering it, but keep its functions. Move what it counted into `onDefeat` (defeated counter, quest progress), and game over into `onPlayerDown`. My HUD's HP still shows the same variables.
- **My fixed step, map scene only:** `if (sc.update(input) === false) return;` then my walking only when `sc.canMove()`. `input = {x, y (held -1..1), attack}`; `attack` is latched on keydown and cleared after this step reads it. While a dialogue or menu is open: no `update()`. The talk key talks or opens when something is in front, otherwise swings.
- **My draw pass:** `sc.draw(ctx, -camX, hudH - camY, {layer: 'below'})` after the tiles; my y-sorted sprites plus `sc.sprites(...)`; my hero with `globalAlpha = sc.playerAlpha()`; then `sc.draw(..., {layer: 'above'})`; HUD last. Hero facing during a swing: `sc.pose().face`.
- **My autoplay:** keep its route to NPCs, chests and exits, but feed the next waypoint (world px) to `sc.autopilot({next, speed: <my walk speed>})` and use its output as input. It dodges by scoring danger along each path and fights.

**3. Self-check without a browser** (report each):
1. Every function, name and URL parameter still exists; `node --check` each script; every load-time identifier is defined.
2. `update()` runs in the real loop and in the `?t=` fast-forward loop, once per step.
3. Trace one swing: keydown → latch → 4 + 4 + 10 frames → `onHit` → knockback ≈ 15 px → `onDefeat` updates my counters.
4. Trace autoplay from the title to the end: every quest step is still reached.

**4. Acceptance** (screenshot if you can):
- A swing shows blade and arc trail; struck enemies flash and slide back; three timed taps play the combo.
- After being hit the hero flickers half-transparent (never vanishes) and takes no damage meanwhile.
- Rushers mark their lane before charging; ranged enemies show an aim line before firing.
- My autoplay finishes the game; dialogue, title and restart work; no console errors; no horizontal scroll at 500 px.
