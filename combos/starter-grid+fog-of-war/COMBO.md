# Add fog of war to the Ford Skirmish starter

`index.html` is a complete game built on the grid movement range + path arrow element; build on it. `index.README.md` documents its extension points. Add:

- `fog-of-war.js` (one global, `GameDNA_FogOfWar`), API in `fog-of-war.README.md`

## Rules

1. **Modules verbatim:** load each addon module with its own `<script src>` (or pasted unchanged into its own `<script>`) before the game script, so it exists in the ADDONS slot. Never edit a module or the starter's own systems; add code only through the extension points.
2. **Register each addon** as one object: push it onto `game.addons` in the ADDONS slot of section 8 of `index.html`, before `newGame()` (hooks: `onHit(ev)`, `update(game, {dt, frozen})`, `drawGround(ctx, cam, game)` (under overlays and units), `draw(ctx, cam, game)`, `drawUI(ctx, game)` (top UI layer), `onKey(e, down)`, `onTurnStart(turn, side)`, `onPhase(phase)`).
3. **Turn off the starter's built-in equivalent** of each addon (check its README flags); otherwise both draw.
4. **Keep everything working:** `?auto=1`, `?t=<ms>&freeze=1` (also with `&script=`), keys E (end turn) and R (restart), the End turn button, mouse and touch. Addons advance only in the `update` hook (never on real time), so `?t=` fast-forward shows them; consume no game key.
5. Keep the native resolution and integer scaling; anything new you draw or name is original (no real game, character, place or brand names).

## Fog of war

On a tile map, everything outside your units' sight sinks under a slowly drifting, dithered fog with a soft one-tile edge; terrain stays faintly readable, hidden enemies are not drawn, the tile where you last saw one keeps a faint silhouette, a "!" pops when one comes into view, forests block sight and hills extend it, and tiles clear or fog over smoothly as units move.

**Parameters:** `radius` = 3, `shape` = diamond, `density` = 0.6, `edge` = 1, `drift` = 6, `fade` = 240, `ghosts` = on, `pop` = on, `shroud` = off, `scheme` = night.

**Wiring** (one addon object):

1. *Create:* In the ADDONS slot, before the addon object: `const fog = GameDNA_FogOfWar.create({params: {radius: 3, shape: 'diamond', density: 0.6, edge: 1, drift: 6, fade: 240, ghosts: 'on', pop: 'on', shroud: 'off', scheme: 'night'}, ...})` with `cols: MW, rows: MH, tile: TS, view: {x: 0, y: 0, w: W, h: H}, units: () => game.units, isPlayer: u => u.side === 'a', posOf: u => { const a = game.anchorOf(u.id); return a && { x: Math.round((a.x - TS / 2 + game.cam.x) / TS), y: Math.round((a.footY - TS + game.cam.y) / TS) }; }` (the tile where the unit is drawn, mid-walk too), `visionOf: (u, x, y) => 3 + (MAP[y][x] === 'H' ? 2 : 0)`, `blocks: (x, y) => 'FWM'.includes(MAP[y][x])` (forest, wall, peak), `ghostSprite: u => ({ img: spriteFrames(u.name, u.side).idle0, flip: u.side === 'b' })` (the art script's sprite, mirrored like `drawUnit` does), `uiRects: () => game.uiRects()`. Then push `{update, drawGround, draw, onTurnStart}` onto `game.addons`.
2. *Clock:* `update(game, {dt, frozen})` runs every 60 Hz step, also during hit-stop; `dt` is in seconds (1/60) and `frozen` is true while the world is stopped. `game.hitStop(ms)` freezes the world. In `update(game, {dt, frozen})`: `fog.update(frozen ? 0 : dt * 1000)` (dt is in seconds).
3. *Draw:* `draw(ctx, cam, game)`: native 240x160 context already translated by any shake, after units, before flash, vignette, HUD and the grid windows: `fog.drawGhosts(ctx, cam);`. The fog layer itself goes in the addon `drawGround(ctx, cam)` hook: `fog.draw(ctx, cam);` (the starter calls it after the ground, before the grid overlays, arrow and units).
4. *Hide:* In the ADDONS slot: `game.isUnitVisible = u => fog.isUnitVisible(u);`. The starter uses it for drawing only: a hidden enemy loses its sprite, HP bar, damage number, the grid unit window and the camera follow, while rules, the grid movement, `plan()` and `aiStep()` keep the full list. Do not edit the starter outside the ADDONS slot.
5. *Reset:* `onTurnStart(turn, side)` with `turn === 1 && side === 'a'` (new game and restart): `fog.reset(); fog.recompute(game.units);`

**Common mistakes:**

- Hidden enemies drawn in the fog -> `game.isUnitVisible` was not replaced (Hide).
- Fog over units, range overlay or arrow -> `fog.draw` belongs in the addon `drawGround` hook, not in `draw`.
- Everything fogged around the heroes -> `posOf` must return tiles, not screen px.

## Checks

- [Fog of war] Around the heroes the map is clear; elsewhere fogged (dithered drifting mist, soft edge, terrain readable); enemies in fog are not drawn; approaching one shows a "!"; leaving one leaves a silhouette.
- `?auto=1` still reaches VICTORY, with the addons working on every relevant event; `?t=<ms>&freeze=1` shows them mid-game; no built-in duplicates; no console errors.

## Self-check without a browser

- Each module file is byte-identical to the one given: `fog-of-war.js` sha256 `569cd47380bead68...`.
- `node --check` your addon script (copy an inline script to a temp .js). Outside the registration slot, the starter is unchanged (diff it).
- [Fog of war] Cursor and hover over a hidden enemy look as on an empty tile (the grid module's hover window is a known leak: report it).
- [Fog of war] Trace one autoplay move: walk -> `update` -> `fog.update` reads the drawn tile -> reveal "!" -> `drawGround` (fog) and `draw` (ghosts); nothing is edited outside the ADDONS slot.
- Trace one autoplay event from `applyHit` (an autoplay attack and its counter) through your addon hooks to the draw, and say which hooks you added.
