# Add loot drops with rarity beams to my game

Defaults (change before pasting):
`{{magnet}}` = 56 · `{{beams}}` = uncommon · `{{tags}}` = all · `{{distance}}` = 1 · `{{bounce}}` = 1 · `{{render}}` = auto

---

You are given `loot-beams.js`, a finished module, and its `README.md`. **Include the module verbatim** (`<script src>` before the game script, or pasted unchanged into its own `<script>`). It defines `GameDNA_LootBeams`. Read the README API table first.

Only add code; never delete game functions.

**First, map my game**: the fixed step and how `?t=`, `?freeze=1`, `?auto=1` drive it; world vs screen coordinates, camera, wall / water test; draw order; HUD boxes and windows; where foes die and chests open; existing drops and pickups; restart.

**Integration points**

1. **Create one instance** after the map exists:
```js
const loot = GameDNA_LootBeams.create({
  seed: 1, scale: VIEW_H / 360, tile: TILE,
  solid: (x, y) => /* the game's own wall/water test, WORLD px */,
  bounds: { x: 0, y: 0, w: MAP_W, h: MAP_H },
  player: () => ({ x: /* feet x */, y: /* feet y */, h: /* sprite height */ }),
  camera: () => ({ x: camX, y: camY }), view: { x: 0, y: 0, w: VIEW_W, h: VIEW_H },
  uiRects: () => [/* every HUD box and open window, same space as view */],
  avoid: () => [/* sprite boxes of player, NPCs, foes, WORLD px */],
  occluders: () => [/* tall props + those sprite boxes, WORLD px */],
  onPickup: d => { /* credit it */ },
  params: { magnet: {{magnet}}, beams: '{{beams}}', tags: '{{tags}}', distance: {{distance}}, bounce: {{bounce}}, render: '{{render}}' }
});
```
2. **Drops**, once each: where a foe dies `loot.drop(feetX, feetY, 'foe', { z: 12 })` (`'elite'`, `'boss'` for bigger foes); where a chest opens `loot.drop(x, y, 'chest', { dx: 0, dy: 1, spread: 3 })`. If the game already drops things (coins, XP), turn exactly those into loot specs `[{ item: 'gold', rarity: 'common', count: 2 }, { item: 'crystal', rarity: 'common', name: '3 XP', data: { xp: 3 } }]`, keep the game's own random calls in the same order, and credit them in `onPickup` instead of the old pickup code (never both). Extra items roll with `loot.roll('foe')` (the module's own random numbers).
3. **Advance**: at the end of the fixed step, `loot.update(worldRunning ? stepMs : 0)` (0 in menus, dialogue, pause, battle screens).
4. **Draw**: `loot.drawGround(ctx, camX, camY)` after the floor, before sprites; `loot.draw(ctx, camX, camY)` after sprites (pass `0, 0` inside a camera translate); `loot.drawTags(ctx)` outside the camera translate, just before the HUD, in the `view` space.
5. **Reset**: `loot.clear()` on new game / restart. If an autopilot walked to the old drops, point it at `loot.list()` items with state `rest`.

**Keep every caller working**: `?auto=1` still finishes (same ending unless pickups now credit rewards a little earlier; say so); `?t=<ms>&freeze=1` runs the same steps; restart leaves no loot. Never use `Math.random` for loot.

**Self-check without a browser**
- `solid`, `bounds`, drops, `player`, `avoid` are world px; `view`, `uiRects`, `drawTags` share one screen space.
- `drop` once per event; no reward credited twice; `update` once per step everywhere.

**Acceptance checks**
1. A defeated foe throws items that arc, bounce and settle on open ground; nothing lands in a wall, water or off the map (`loot.audit()` stays 0).
2. Uncommon and better items show a beam in their colour; tags never overlap each other, the HUD or open windows.
3. Walking close pulls items in; each is credited once.
4. `?auto=1` finishes without console errors; the same `?t=` frame twice is identical.
