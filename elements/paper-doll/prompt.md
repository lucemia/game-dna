# Add a paper-doll hero with a wardrobe to my game

Defaults (change before pasting):
`{{stride}}` = 5 · `{{look}}` = { top: 'tunic/forest', weapon: 'sword' } · `{{wardrobeKey}}` = C

---

You are given `paper-doll.js`, a finished module, and its `README.md`. **Include the module verbatim** (`<script src>` before the game script, or pasted unchanged). It defines `GameDNA_PaperDoll`. Read the README first.

Only add code; never delete game functions.

**First, map my game**: the fixed step and `?t=`, `?freeze=1`, `?auto=1`; the hero's box, facing, walk counter, attack timer and hit box; jumping; the camera; the HUD; the keys used; save data.

**Integration points**

1. **Create once** when the game starts (not per frame):
```js
const doll = GameDNA_PaperDoll.create({ look: {{look}}, params: { stride: {{stride}} } });
const wr = GameDNA_PaperDoll.wardrobe({ doll, view: { x: 0, y: 0, w: VIEW_W, h: VIEW_H } });
```
**Size**: about 22 px tall (31 with a tall hat), bigger than a 16 px sprite; whole-number `scale` only. The game keeps its own hitbox and feet line.
2. **Draw the hero with the doll** wherever the old hero sprite was drawn (map, title, battle screens): `doll.draw(ctx, feetX, feetY, { dir, moving, walk, attack, air, scale })`, with `feetX` = centre of the hero's box, `feetY` = its bottom, after the camera. `dir` is the game's facing; `walk` the game's own distance or step counter (only grows while moving); `attack` = swing progress 0..1 or `null`; `air` while airborne. Battle screens: `scale: 2` or `3`. Blinking: `alpha`. Do not draw the old weapon sprite when the doll holds a weapon; hit boxes stay the game's own.
3. **Never mirror the doll** (`scale(-1, 1)`): pass `dir: 'left'`. The weapon must stay in the right hand.
4. **Step**: `doll.update(dt)` and `wr.update(dt)` in the fixed step (also the `?t=` fast-forward). While `wr.isOpen()`, the player, enemies and timers do not move (it is a pause screen).
5. **Input**: `{{wardrobeKey}}` (and a small HUD button for touch) opens `wr.open()` when the hero is free to act (not in a fight, dialogue or menu). While open, send every key first to `wr.input('up'|'down'|'left'|'right'|'ok'|'back')` and taps to `wr.pointer(x, y)` in canvas px; if it returns `true`, the game must not use that key. Autoplay never opens it.
6. **Draw** `wr.draw(ctx)` last, over the world and HUD.
7. **Save** `doll.look()` with the game's save if there is one.

**Keep every caller working**: `?auto=1` reaches the same end as before; `?t=<ms>&freeze=1` gives the same frame twice; restart, title screen and every screen that drew the hero still draw it.

**Self-check without a browser**
- Work one example through `feetX` / `feetY` (box, camera, any sprite offset): the feet must land on the old sprite's feet.
- `attack` is `null` when idle, never stuck at 0.
- Search for every place the old hero sprite was drawn; each now draws the doll.
- Every key the game reads goes through `wr.input` first while it is open.

**Acceptance checks**
1. The hero walks in all four directions with a 4-step walk; turning left keeps the weapon in the same (right) hand, behind the body.
2. The attack plays its 3 frames with the weapon in hand; the game's hits are unchanged.
3. `{{wardrobeKey}}` opens the wardrobe; changing hat, top or weapon shows on the preview and on the walking hero; Z / X close it; the game was paused meanwhile.
4. `?auto=1` ends as before without console errors; the same `?t=` frame twice is identical.
