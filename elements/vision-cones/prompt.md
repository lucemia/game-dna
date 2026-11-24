# Add stealth vision cones (guards that notice, alert and search) to my game

Defaults (change any before pasting):
`{{range}}` = 150 · `{{fov}}` = 80 · `{{react}}` = 900 · `{{decay}}` = 2600 · `{{sweep}}` = 55 · `{{callRadius}}` = 170 · `{{shadow}}` = 0.5 · `{{opacity}}` = 1 · `{{palette}}` = lamp · `{{render}}` = auto

---

You get `vision-cones.js` (a finished module, global `GameDNA_VisionCones`) and its `README.md`. **Include the module verbatim** (`<script src>` before my game script, or pasted unchanged into its own `<script>`); never edit it.

The module decides who sees the player and draws cones and '?' / '!' marks. **My game keeps its rules**: alerts act through my existing enemy code. Add code; never delete, rename or replace my functions.

**First, map my game**: fixed step and its callers (rAF, `?t=` fast-forward, `?auto=1`); camera; view height; tiles that block sight (water usually does not); hiding spots (tall grass, shade); player body; enemies (spawn, death, ids, how they notice the player, sprite facing); pause, windows, restart.

**Integration points**

1. **Create one instance** after the map exists, before the first new game:
```js
const vision = GameDNA_VisionCones.create({ scale: VIEW_H / 360,
  params: { range: {{range}}, fov: {{fov}}, react: {{react}}, decay: {{decay}}, sweep: {{sweep}},
    callRadius: {{callRadius}}, shadow: {{shadow}}, opacity: {{opacity}}, palette: '{{palette}}', render: '{{render}}' },
  walls: { tile: TILE, cols: MAP_W, rows: MAP_H, solidTile: (c, r) => /* this tile blocks sight */ },
  player: () => /* in this scene and alive */ ? { x, y } : null,   // body middle, world px
  canSee: () => /* no window or cutscene */,
  hidden: (x, y) => /* tall grass here */ ? 1 : /* shade */ ? 'shadow' : 0 });
```
2. **Guards**: where each enemy is created (once; ids stable): `vision.add(id, { eye: /* sprite height */, source: () => alive ? { x, y } : null })`; on death `vision.remove(id)`; new game `vision.clear()`.
3. **Alert hook**: where an enemy decides to chase, use `vision.isAlert(id)` as the trigger; keep a short close-range rule so touching enemies still react.
4. **Facing**: enemy sprites take their direction from `vision.dir4(id)`, `vision.side(id)` or `vision.facing(id)` (radians); frontal sprites can shift their eyes toward `facing`. Each guard looks where its cone points.
5. **Every fixed step**, after enemies move: `vision.update(STEP_MS)`; `vision.update(0)` while paused or behind a window.
6. **Draw**: `vision.drawCones(ctx, camX, camY)` after the ground, **before** the sprites; `vision.drawMarks(ctx, camX, camY)` after the sprites, before the HUD (`0, 0` inside a camera translate).

**Keep every other caller working**: `?auto=1` still reaches its ending with no errors (never change the bot's route); `?t=<ms>&freeze=1` shows the same frame every run (`update` in the step, never in render); restart, pause, shortcuts still work.

**Self-check without a browser**
- `update` once per step, `0` while stopped; `player()` and `source()` in world px or `null`; `walls` uses the game's tile size; `add` once per enemy.
- Example: a guard at (0, 0) looking right (range 150, fov 80) sees (100, 50) unless a wall lies between, not (60, 80) (53 degrees), not a player in grass; straight ahead at 112 px it alerts after about 830 ms.
- Nothing used before defined.

**Acceptance checks** (screenshots if you can)
1. Cones lie under the sprites, stop at walls; each guard faces its cone.
2. In a cone '?' fills (faster close and centred); out of it, it drains.
3. Full: '!', the guard reacts through my rules, nearby guards turn '?'; then it searches and calms.
4. Tall grass inside a cone: never seen.
5. `?auto=1` ends with no console errors.
