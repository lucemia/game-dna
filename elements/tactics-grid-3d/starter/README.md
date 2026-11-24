# Terrace Skirmish: N-03 starter (system element)

`index.html` is a complete single-file 3D grid-tactics skirmish built on `module/tactics-grid-3d.js` v1.0.0 (pasted unchanged into its own `<script>`). `three.min.js` (three.js 0.149.0, MIT) must sit next to it.

- **Field:** a 12 x 12 river valley of grass terraces, a stone causeway, sand fords, water and a ruined plateau.
- **Units:** Aldric and Corin (Knights), Brenna and Dessa (Lancers) against Gorrak and Mukka (Brutes, axes) and Vesh and Ilza (Shamans, range 1-2 magic that halves DEF).
- **Player turn:** select a unit (blue = where it can stop, red = where it can strike after moving, gold arrow = the path). Confirm a tile to walk there, then choose Attack / Wait / Back. Attack opens the target picker and the forecast (damage, crit 10%, counter, height bonus).
- **Enemy phase:** each enemy uses `plan()` (also used by autoplay).
- **Game end:** VICTORY when all enemies fall, DEFEAT when all your units fall, TIME UP after turn 20. **R** restarts.
- **Rules:** damage = ATK - DEF (magic: DEF / 2), +1 per level above the target (max +2), -1 per level below (max -2), min 1; crit 10 % x1.5 from a seeded stream; the defender counters if it survives and reaches. Move: terrain cost (sand 2) + 1 per level climbed; climb at most JMP levels, drop at most JMP + 1; water, trees, rocks and ruins block.
- **Input:** arrows / WASD move the cursor in screen directions (the module maps them to grid steps for the current camera turn), Z / Enter / Space confirm, X / Esc back, Q / E turn the camera 90 deg, + / - or wheel zoom, T threat of all enemies (hovering an enemy shows its own), F end turn, P autoplay on / off, R restart. Mouse: hover, click, right-click back. Touch: tap. On-screen buttons: rotate, zoom, threat, END TURN.
- **URL flags:** `?auto=1` plays both sides (VICTORY on turn 7, about 98 s of game time). `?t=<ms>&freeze=1` replays that many 60 Hz steps and draws once (`window.__frozen = true`, `<html data-state>`); `window.__advance(ms, noDraw)` steps further. `&script=range|threat|menu|target` sets up those screens. `?seed=`, `?zoom=`, `?cam=0-3`, `?light=day|dusk`.
- **Battle camera:** before an exchange where the attacker would stand behind its target, the camera turns 90 deg (`?battleCam=0` turns this off). Trees in front of units fade, units behind terrain show team silhouettes. Actions wait for falls and projectiles to finish (`whenIdle`).
- **Phones:** in portrait the stage fills the screen with a 540-wide logical view (`VW`, `VH` are set in `fit()`; addons read `GAME.overlay.w / h`).
- **Text state:** `window.__state()` = the module's `state()` (facing measured on the model) plus `hp`, `name`, `acted`, `phase`, `turn`, `mode`, `result`, `endT`. `window.__anchor(id)`.

## Structure (sections in the game script)

| # | section | what is in it |
|---|---|---|
| 1 | CONFIG & ROSTER | `MAP` rows (heights, terrain, props), `ROSTER` (`hp atk def mv jump rng magic cls side`), URL flags |
| 2 | EXTENSION POINTS | the `GAME` object (below) |
| 3 | RULES | `damage()`, `GAME.forecastData()`, **`applyHit()`** (the hit site), `combat()` (attack -> counter) |
| 4 | BATTLEFIELD | `GameDNA_TacticsGrid3D.create(...)`, `placeUnits()` |
| 5 | TURNS & AI | `startTurn`, `endTurn`, `checkEnd`, `plan()`, `execute()`, `runSide()`, the player state machine (`idle -> move -> walking -> menu -> target -> busy`) |
| 6 | INPUT | the input chain |
| 7 | UPDATE & DRAW | `step()` at 60 Hz, `draw()` |
| 8 | BOOT | `GAME.boot()`: called by the last `<script>`, after the **ADDONS SLOT** `<script>` |

## Extension points

An addon is one object pushed onto `GAME.addons` **in the ADDONS SLOT** (the `<script>` right before `GAME.boot()`), so it sees the first frame and every `?t=` replay. Load addon modules with `<script src>` tags right above that slot (or paste them into it). Every member is optional:

```js
GAME.addons.push({
  onHit(ev, game) {},            // (1) every HP change, on the impact frame, after HP changed
  onMove(ev, game) {},           // (2) every walk step {id, from, to, step, steps, hop, dh, dir}; ev.end = true when a move ends
  update(game, { dt, frozen }) {},// (3) every 60 Hz step; dt in ms (16.67, 0 while frozen)
  draw(ctx, game) {},            // (4) 2D overlay, effects layer: after HP bars and built-in numbers, before the HUD
  drawUI(ctx, game) {},          // (5) 2D overlay, top UI layer: after HUD, menus, forecast; before banners
  scene3d(THREE, scene, game) {},// (6) after the world and the units are built (new game and restart): add 3D objects
  onKey(e, down, game) {},       // (7) first in the input chain; return true to consume
  onTurnStart(turn, side, game) {}, onPhase(phase, game) {}, onEnd(result, game) {}   // (8)
});
GAME.builtinNumbers = false;     // when your addon draws damage numbers itself
```

1. **Hit site: `applyHit(attacker, target, amount, kind, crit)`.** Every HP change goes through it; addons call `GAME.hit(attackerId | null, targetId, amount, kind)` (kind `'attack' | 'counter' | 'heal'`). It clamps HP, starts `hurt` or `defeat`, hit-stop (60 ms, crit 110), shake, crit flash, the built-in number, then `onHit(ev)`:
   `ev = {attacker, target, amount (HP really lost or gained), kind, crit, killed, hpBefore, hpAfter, max, anchor}`.
   Feedback helpers: `GAME.hitStop(ms)`, `GAME.shake(px, ms)` (camera shake), `GAME.flash(color, ms)`.
2. **Moves:** `onMove` per tile step at the moment the unit turns toward the next tile (`dir` = grid step), and once with `end: true` when it stands on its new tile.
3. **Clock:** `update` runs every fixed step also during hit-stop (`frozen: true`, `dt: 0`). Use only this clock (no wall clock) so `?t=` freezes show your addon.
4. **Overlay canvas:** `ctx` is the 2D overlay in logical px, 960 x 540 (`GAME.overlay`), already scaled to the device pixels. The 3D view is drawn before it, so 2D is always on top. `GAME.field = {x: 0, y: 0, w: 960, h: 540}`.
5. **Anchors:** `GAME.anchorOf(id)` -> `{x, top, w, h, left, footY, cy, dead}` in overlay px where the model is drawn now (walks, hops, lunges); `top` includes the HP bar. It answers for fallen units. `GAME.unitRects()` = each living unit's box with its `id`. Units: `GAME.units` (`hp > 0` alive), `GAME.unitById(id)`.
6. **UI rects:** `GAME.uiRects()` = the HUD panels, buttons, menu, forecast and banner of the last frame plus rects registered with `GAME.setUIRect(name, rect)` (`null` removes).
7. **3D access:** `GAME.tg` is the module instance: `scene`, `camera`, `worldOf(x, z)`, `project(...)`, `tile(x, z)`, `setModel(id, object3d, {facingOffset, height})` to replace a unit's look (e.g. billboards), `registerLook(...)`, `state()`. Add objects in `scene3d`; animate them in `update`.
8. **Turn events:** `onTurnStart(turn, side)` (`'a'` player, `'b'` enemy; turn 1 'a' also on restart), `onPhase('player' | 'enemy' | 'over')`, `onEnd('VICTORY' | 'DEFEAT' | 'TIME UP')`. Read `GAME.turn`, `GAME.phase`, `GAME.result`, `GAME.auto` any time.
9. **Forecast:** `GAME.forecastData(attId, defId)` -> `{dmg, crit, hpAfter, counter: {dmg, hpAfter} | null, height}` from the game's own rules.
10. **Content (ADDONS SLOT, before boot):** `GAME.addClass(id, {name, look, attack})` registers a class: `look` is a built-in model (`knight`, `lancer`, `archer`, `brute`, `shaman`), `attack` is the animation (`'melee'`, `'arrow'`, `'bolt'`). `GAME.addUnit({id, name, cls, side, x, z, hp, atk, def, mv, jump, rng: [min, max], magic?})` adds a unit to the roster (unique id, a passable tile not used by another unit). Ranges, threat, the AI, autoplay, counters (a counter needs the attacker inside the defender's own range) and the HUD all follow the roster data; nothing else needs code.
   ```js
   GAME.addClass('ranger', { name: 'Ranger', look: 'archer', attack: 'arrow' });
   GAME.addUnit({ id: 'wren', name: 'Wren', cls: 'ranger', side: 'a', x: 0, z: 9, hp: 22, atk: 11, def: 3, mv: 4, jump: 2, rng: [2, 2] });
   ```

## Changing the game

- **Units:** add rows to `ROSTER` or use `GAME.addClass` / `GAME.addUnit` (item 10). `rng: [2, 2]` is a 2-tile ranged attack; `magic: true` halves DEF. `combat()` takes the animation from the class (`CLASS_DEF`). A counter uses the defender's own range.
- **Map:** edit the three `MAP` row arrays (same length). Spawn tiles must be passable.
- **Look:** module params in `makeBattlefield()` (`zoom`, `light`, `overlay`, `unitHeight`...).
- **Self-check without a browser:** every new unit id is unique and stands on a passable tile; `node --check` a copy of the game script; trace one autoplay attack from `plan()` -> `execute()` -> `combat()` -> `applyHit()` -> `onHit`.
