# Add generated townsfolk to my game

Defaults (change before pasting):
`{{seed}}` = 7 · `{{count}}` = 6 · `{{speed}}` = 22 · `{{talkKey}}` = the game's talk / confirm key

---

You are given `npc-generator.js`, a finished module, and its `README.md` (read it first). **Include the module verbatim** (`<script src>` before the game script). It defines `GameDNA_NpcGen`. Only add code; never rewrite game functions.

**First, map my game**: the fixed step and `?t=`, `?freeze=1`, `?auto=1`; tile size and camera; how the world reaches the screen (camera, a HUD bar shifting the map); the solid test; the depth sort; the hero's feet; the always-on HUD boxes; everything the talk key does; screens that pause the world.

**Integration points**

1. **Create the town once** per new game (also restart), in a walkable village or square, off the game's paths to its goals:
```js
const town = GameDNA_NpcGen.town({ seed: {{seed}}, count: {{count}}, speed: {{speed}},
  area: { x, y, w, h },                    // world px
  blocked: (x, y) => /* the game's own solid test for one world point */,
  scale: 1 });                             // 2 when tiles are 32-48 px
```
2. **Update** `town.update(STEP_MS, { x: heroFeetX, y: heroFeetY })` in the fixed step (the one `?t=` replays), not while the world is paused.
3. **Draw** in the game's depth sort: push `town.drawables(camX, camY)` (`{y, draw(ctx)}`, `y` = feet in world px); pass `0, 0` if the canvas is already camera-translated. Never mirror or scale them. The talker's speech marker comes with its draw.
4. **Talk key**, only when the game's own targets did not answer:
```js
if (town.talking()) town.release();        // the key closes an open talk
else { const f = town.nearest(heroFeetX, heroFeetY, r);   // r about 1.5 tiles
       if (f) town.talk(f, { x: heroFeetX, y: heroFeetY }); }
```
The person steps aside if the hero stands on them, then faces the hero; walking about 3 tiles away ends the talk. Never open the game's dialogue box for them.
5. **Talk panel** (portrait, name, trade, line): every frame, after the world, before menus, in the HUD's screen transform:
```js
town.panel(ctx, camX, camY, { view: { x: 0, y: 0, w: VIEW_W, h: VIEW_H }, avoid: hudRects });
```
`camX, camY`: screen = world - cam (a map drawn 16 px lower needs `camY = camera.y - 16`). `hudRects` = screen boxes of the always-on HUD (array or function).
6. Townsfolk are not solid and read no input: never add them to collision, path finding or enemy lists.

**Keep every caller working**: `?auto=1` ends as before; `?t=<ms>&freeze=1` gives the same frame twice; restart, title and battle still work.

**Self-check without a browser**
- World (200, 150), camera (64, 40): drawn at (136, 110); with a 16 px bar above the map, `town.panel` gets `camY = 24`.
- `blocked` is true for walls, water, houses and props and never throws.
- `town.update` runs once per fixed step, only while playing.
- The talk key still reaches every old target first.
- `hudRects` lists every always-on HUD box.

**Acceptance checks**
1. {{count}} different-looking townsfolk walk in four directions with stepping feet, never inside walls or props, and step round each other and the hero.
2. `{{talkKey}}` next to one: they stop and face the hero, a marker shows over their head, the panel shows their portrait, name, trade and line inside the view, clear of the HUD and both speakers; the key again or walking away closes it.
3. The same seed gives the same people after a reload.
4. `?auto=1` ends as before without console errors; the same `?t=` frame twice is identical.
