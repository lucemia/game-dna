# Add smooth ribbon trails (sword swings, dashes, projectiles) to my game

Defaults (change any before pasting):
`{{life}}` = 220 · `{{width}}` = 1 · `{{taper}}` = 1.3 · `{{fade}}` = 1.2 · `{{core}}` = on · `{{glow}}` = 0.5 · `{{smooth}}` = 4 · `{{palette}}` = steel · `{{render}}` = auto · `{{reduced}}` = system · `{{contrast}}` = auto

---

You are given `ribbon-trails.js` (a finished module, one global `GameDNA_Ribbons`) and its `README.md`. **Include the module verbatim** (`<script src>` before my game script, or pasted unchanged into its own `<script>`); never edit it.

Drawing only: **positions, hit boxes, timing and rules must not change.** Add code; never delete, rename or replace my functions.

**First, map my game**: fixed step and its callers (rAF, `?t=` fast-forward, `?auto=1`); scenes and their coordinates; camera; view height; how weapons, dashes, knockback and projectiles move and draw; pause, hit-stop, windows, restart.

**Integration points**

1. **Create one instance** after the game state exists:
```js
const trails = GameDNA_Ribbons.create({ scale: VIEW_H / 360, params: { life: {{life}}, width: {{width}},
  taper: {{taper}}, fade: {{fade}}, core: '{{core}}', glow: {{glow}}, smooth: {{smooth}},
  palette: '{{palette}}', render: '{{render}}', reduced: '{{reduced}}', contrast: '{{contrast}}' } });
```
2. **Follow 2-5 sources that move fast**, `trails.follow(id, {kind, group, source})`:
   - weapon swing: `kind: 'blade'`; source returns tip `x, y` and hilt `bx, by` from the **same angle and length the draw code uses**, `null` when not swinging;
   - dash, lunge, knockback, charging enemy: `kind: 'dash'` on the body centre (shows only at dash speed);
   - each projectile: `kind: 'projectile', once: true`, unique id;
   - optional floater (wisp, fairy): `kind: 'wake'`.
   If attacks are only a sprite lunge or menu "Attack", trail the weapon or body during that animation (you may draw a simple weapon). Sources return **world px**, or `null` while dead, gone, on the title or in another scene. **Tie each id to one actor** (look it up by its id, never "nearest X"); `trails.remove(id)` when it dies or is replaced.
3. **Every fixed step**, after movement: `trails.update(STEP_MS)` once; `trails.update(0)` while frozen (hit-stop), paused or a dialogue/menu stops the world.
4. **Draw** in each scene with ribbons: `trails.draw(ctx, camX, camY, 'under')` right before the sprites, `trails.draw(ctx, camX, camY, 'over')` right after; HUD after. Inside a camera translate pass `0, 0`. Depth-sorted game: give the hero's blade `layer: 'own'` and draw `trails.draw(ctx, camX, camY, heroGroup)` right after the hero sprite.
5. **Restart, level start and every scene switch**: `trails.clear()` (simplest: in the step, `if (scene !== lastScene) { lastScene = scene; trails.clear(); }`).

Teleports need nothing else. Pixel game: keep `render: 'auto'`.

**Keep every other caller working**: `?auto=1` reaches the same ending at the same time; `?t=<ms>&freeze=1` shows the same frame every run (`update` in the step, never in render); restart, pause, shortcuts still work.

**Self-check without a browser**
- `update` once per fixed step after movement, `0` while frozen or paused.
- Each source returns world px of one existing actor, or `null`; never screen px in a scrolling game.
- Blade source `null` outside swings; tip and hilt match the drawn blade.
- No game logic reads the ribbons.
- Walk one swing: tip, hilt → `update` → `draw` → crescent gone within `{{life}}` ms.

**Acceptance checks** (screenshots if you can)
1. A swing leaves a smooth crescent along the blade's path; no beads or seams.
2. Dashes leave soft body-wide ribbons; projectiles thin cored trails.
3. Teleport, respawn, scene change, restart: no line across the screen.
4. Pause or hit-stop: ribbons hold still, then continue.
5. `?auto=1` to the end: no console errors, same outcome and time.
