# Add capes, scarves, banners and ropes that swing (Verlet cloth) to my game

Defaults (change any of these before pasting):
`{{wind}}` = 0.5 · `{{gust}}` = 0.5 · `{{stiffness}}` = 0.8 · `{{segments}}` = 8 · `{{damping}}` = 0.03 · `{{gravity}}` = 1 · `{{drape}}` = 0.5 · `{{outline}}` = auto · `{{snap}}` = auto · `{{reduced}}` = system

---

You are given `verlet-cloth.js`, a finished module, and its `README.md`. **Include the module verbatim** (`<script src>` before the game script, or pasted unchanged into its own `<script>`); never rewrite it. It defines `GameDNA_Cloth`. Read the README's API table first.

It adds cloth and ropes that swing with movement and wind. Drawing only: **hit boxes, positions, timing and rules must not change.**

Add code only; never replace, rename or delete functions.

**First, map my game**: the fixed step and its callers (rAF loop, `?t=` fast-forward, `?auto=1`); actor positions, facing, sprite sizes; the camera; view height; respawn, restart and where actors are rebuilt.

**Integration points**

1. **Load** the module before the game script.
2. **Create one instance** after the game's state exists:
```js
const cloth = GameDNA_Cloth.create({ params: { wind: {{wind}}, gust: {{gust}}, stiffness: {{stiffness}}, segments: {{segments}},
  damping: {{damping}}, gravity: {{gravity}}, drape: {{drape}}, outline: '{{outline}}', snap: '{{snap}}', reduced: '{{reduced}}' },
  scale: VIEW_H / 360, camera: () => ({ x: CAM_X, y: CAM_Y }) });   // omit camera if you draw inside a camera transform
```
   Top-down game: anchors also return `fx, fy` (facing vector); that selects top-down physics.
3. **Attach** 2-5 pieces that suit my art: the player's cape (`kind: 'cape'`, anchored at the shoulders, `length` ~0.6 of the sprite height) or `'scarf'`/`'hair'`, and a scenery piece (`'banner'` on a post, `'rope'`/`'chain'` from a beam). If my game already draws a fixed cape, banner or rope, skip that drawing with a condition (don't delete it). The anchor is a function returning world `{x, y, facing}` (top-down: also `fx, fy`), or `null` while the actor is dead, gone or the title shows. Look actors up by id inside it if the game rebuilds them.
4. **Every fixed step**, after movement: `cloth.update(STEP_MS)` once, on every scene that shows cloth.
5. **Draw** next to each sprite: `cloth.draw(ctx, 'back', group)` right before it (capes, hair), `cloth.draw(ctx, 'front', group)` right after it (scarves); scenery pieces where the scenery is drawn; HUD after them. Always pass a group (no group draws everything). Draw inside the hurt blink's `globalAlpha`.
6. **Optional**: swing or dash start → `cloth.impulse(group, -facing * 200, -40)`.

Respawns and restarts need no call: the cloth snaps when its anchor jumps.

**Keep every other caller working**: `?auto=1` reaches the same ending at the same time; `?t=<ms>&freeze=1` shows the same frame every run (`update` in the step, not render); shortcuts, pause, restart still work.

**Self-check without a browser**
- The module is byte-identical and loads before `create`.
- `cloth.update` runs once per fixed step, after movement.
- Each anchor returns world px of something that exists, or `null`; never 0 or the screen centre.
- No game logic reads the cloth.
- After a respawn the cape is at the new place, not stretched from the old one.
- No function was removed or renamed.

**Acceptance checks** (screenshots if you can)
1. Standing: the cape hangs and stirs in the wind; banners fly; ropes sway.
2. Running and turning: the cape trails behind.
3. Respawn or restart: cloth appears at the new position at once, no line across the screen.
4. Pixel game: whole pixels, 1 px outline; HD: smooth shading.
5. `?auto=1` to the end: no console errors, same outcome and time.
