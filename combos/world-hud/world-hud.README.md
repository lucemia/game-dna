# world-hud.js (C-12 module, v1.2.1)

One plain script, no dependencies, no `import`/`export`, ASCII only. It defines one global, `GameDNA_WorldHud`. Paste it into a `<script>` tag or load it with `<script src>`, without changing it. It owns the whole element: rings under units with an HP arc (a pale loss segment drains after a hit), floating name plates that never overlap each other, the game's HUD rects or the view edge, a marker with the distance above the current goal, and arrows on the screen edge pointing at off-screen targets. Your game keeps its own units, camera and HUD; the module only reads them. It never changes game state and never reads input.

Crisp whole pixels with a built-in bitmap font on native pixel canvases (view width <= 512, or smoothing off); smooth vector drawing on HD canvases (any `ctx` transform, e.g. a dpr scale).

## API

`GameDNA_WorldHud.create(options)` returns an instance.

| option | meaning |
|---|---|
| `view` | `{x, y, w, h}` (or a function): the screen rect, in the coordinates `draw` gets, where the camera view is drawn (below a HUD bar, not over it). Default: the whole canvas. |
| `camera()` | `{x, y, w, h}`: the world rect shown in `view`. `w`/`h` default to the view size (no zoom). World px -> screen: `view.x + (x - cam.x) * view.w / cam.w`. |
| `toScreen(x, y)` | Optional instead of `camera`: your own world -> screen function (iso, rotated cameras); `zoom` then scales the rings. |
| `units()` | `[{id, x, y, r, h, hp, maxHp, team, name, level, boss, focus, track, plate, ring, color}]` in **world px**. `x, y` = the FEET (ground point, where the shadow is). `r` = footprint radius (ring size), `h` = sprite height above the feet (the plate sits above it). `team`: `'hero'`, `'ally'`, `'enemy'`, `'npc'` (colours). `hp`/`maxHp` give the arc and the plate bar (leave out for no arc). `boss` and `focus` get priority and a thicker ring; `track: true` gives the unit an edge arrow while it is off screen; `plate: false` / `ring: false` turn that part off for one unit. Leave dead units out (or `alive: false`). |
| `targets()` | `[{id, kind, x, y, h, label, track, marker, color}]` in world px. `kind`: `'goal'` (the CURRENT objective: marker above it on screen, edge arrow off screen, ground ping), `'enemy'`, `'ally'`, `'npc'`, `'item'`, `'poi'` (arrows only when `track: true`). Swap the goal when the quest moves on. |
| `player()` | Optional `{x, y}` world point for distances (default: the first `'hero'` unit). |
| `safeRects()` | Screen rects nothing may cover: HP bars, score, quest text, dialogue boxes, menus, minimap, touch buttons. Asked every draw. |
| `avoid` (param) | `'auto'` (default): plates never cover a hero's or the focused unit's sprite, and at UI scale >= 2 no unit's sprite; lower-priority plates are hidden instead. `'heroes'`, `'all'`, `'soft'` (only a cost). |
| `skin`, `params` | Skin id/object (colours from `ink`, `ui.*`, `team.*`, `text.*`); params below. |

Params: `rings` `'on'`, `squash` 0.5 (ring height / width; 1 = straight overhead), `ringSize` 1, `arc` `'hp'` (`'off'` = plain team ring), `plates` `'auto'` (party always; enemies when focused, a boss or hit in the last 3 s; named npcs; at UI scale >= 2 only the party and the focused unit. Or `'all'`, `'enemies'`, `'damaged'`, `'named'`, `'off'`), `plateHp` `'on'`, `level` `'on'`, `leader` `'on'` (line to a displaced plate), `maxPlates` 16, `arrows` `'on'`, `markers` `'on'`, `distance` `'on'`, `unit` 16 (world px per metre), `unitLabel` `'m'`, `margin` 4, `scale` 0 (auto UI size; 2 = double on a phone), `render` `'auto'` (`'crisp'`, `'smooth'`), `lowHp` 0.3 (arc pulses red below), `holdMs` 450, `drainPerSec` 0.55, `fadeMs` 160, `ping` `'on'`.

| method | |
|---|---|
| `update(dtMs)` | Every fixed step, also in the `?t=` fast-forward. Drives the HP loss drain, plate fades and pulses, and solves the plate layout (slots with hysteresis, glides), so give `view` (or draw once) before relying on it. |
| `drawGround(ctx)` | After the ground / floor, BEFORE the standing sprites, outside any camera transform: rings and the goal ping, so sprites stand on them. If you skip it, `draw` paints the rings itself (on top of the sprites). |
| `draw(ctx)` | After the world (after your HUD is fine: it never covers `safeRects`), outside any camera transform: plates, markers, edge arrows. Returns what it drew (also `lastDrawn()`). |
| `setFocus(id)`, `focus()` | The selected / targeted unit (brighter ring with rotating ticks, plate first). |
| `reset()` | New game / level. |
| `rects()` | Screen boxes of every plate, arrow, label and marker now (give them to toasts or bubbles as obstacles). |
| `lastDrawn()`, `state()`, `stats()`, `setParams(obj)`, `params()`, `toScreen(x, y)` | Tests, judges, option menus. `lastDrawn()` = `{view, camera, safe, rings:[{id, cx, cy, rx, ry, hp, lag}], plates:[{id, x, y, w, h, slot, leader, anchor}], arrows:[{id, kind, x, y, angle, tip, target, box, dist, label}], markers:[...], hidden:[{id, what, why}]}`. |

## Integration (15 lines)

```js
// <script src="world-hud.js"></script> before your game script
const hud = GameDNA_WorldHud.create({
  view: { x: 0, y: HUD_H, w: SCREEN_W, h: SCREEN_H - HUD_H },            // where the camera view is drawn
  camera: () => ({ x: cam.x, y: cam.y, w: SCREEN_W, h: SCREEN_H - HUD_H }),
  units: () => [{ id: 'hero', x: hero.x, y: hero.feetY, r: 6, h: 18, team: 'hero', name: 'You', hp: hero.hp, maxHp: hero.maxHp },
    ...foes.filter(f => f.alive).map(f => ({ id: f.id, x: f.x, y: f.feetY, r: f.r, h: f.h, team: 'enemy', name: f.name, hp: f.hp, maxHp: f.maxHp }))],
  targets: () => [{ id: 'goal', kind: 'goal', x: goal.x, y: goal.y, label: goal.name }],
  safeRects: () => [hudBarRect, ...(dialogOpen ? [dialogRect] : [])],
  params: { plates: 'all', unit: TILE });
function step(dt) { /* game logic */ hud.update(dt); }                  // every fixed step, also the ?t= replay
function render() { drawGround(); hud.drawGround(ctx); drawSprites(); drawHud(); if (scene === 'play') hud.draw(ctx); }
// inside a camera translate? ctx.save(); ctx.translate(cam.x, cam.y); hud.drawGround(ctx); ctx.restore();
// new game: hud.reset(); targeting: hud.setFocus(enemy.id);
```

## Keep every other caller working

- `?auto=1`, `?t=&freeze=1`, restart, pause and every key must behave exactly as before; the module never changes state and reads no input.
- Call `update` in the same fixed step the `?t=` fast-forward runs, or the frozen still shows no drain.
- Draw only in play scenes; call both draws with the same transform your HUD uses (undo a camera translate, keep a dpr scale).
- Hide your own floating over-head HP bars and name tags while the plates are on (guard the draw call, do not delete the function), or every unit shows its HP two or three times; keep your HUD bars.

## Self-check without a browser

1. The module file is byte-identical to the one given; it loads before `create`.
2. `units()` and `targets()` return WORLD px with `y` at the feet (not the sprite's top-left, no camera subtraction, no HUD offset).
3. `view` is the screen rect of the camera view; `camera()` the world rect it shows; `safeRects()` lists every HUD box in `view`'s coordinates.
4. `update` runs once per fixed step; `drawGround` between ground and sprites; `draw` after the world.
5. Walk one example: camera x 100, view x 0, unit at world x 164 with no zoom -> ring centre at screen x 64.

## What it guarantees (checks/geometry.py)

- Every edge arrow points at its target's screen position (bearing from the arrow, recomputed after it slides past a HUD rect), at any angle, crisp and smooth; it stays inside the view and off every safe rect.
- Plates never overlap each other, a safe rect or the view edge, and never cover a hero's (or the focused unit's) sprite, nor any sprite at UI scale >= 2; a plate that cannot fit is hidden (`lastDrawn().hidden`, why `crowded`), never squeezed.
- Plates do not flicker or blink (checks/temporal.py): a plate that appears stays at least 1.5 s and leaves by a 200 ms fade-out; a hidden optional plate stays hidden at least 1.5 s; party plates are always shown (party in >= 95 % of frames in the checks) and pick first; a plate keeps its slot unless another beats it clearly after 450 ms, and moves by gliding (150 ms); a move no glide can make (plates riding on moving units closing in, or a much better place off its own body) is a 150 ms crossfade, never a one-frame jump. An optional plate pushed again within 0.6 s of a crossfade fades away instead. Only when a hard rule leaves no legal place at all is a plate removed at once (`lastDrawn().hidden` why `forced`).
- Party plates may overlap a teammate's sprite when no fully legal place exists (columns, tight formations): the party is labeled rather than hidden. Enemy and npc plates never cover a hero or the focused unit (any sprite at UI scale >= 2). The layout is solved in `update()`, so `?t=&freeze=1` stills equal play.
- Rings sit on the units' feet as the camera pans and zooms (positions are read at draw time, not cached from `update`).
