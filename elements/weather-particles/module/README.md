# weather-particles.js (E-06 module, v1)

One plain script, no dependencies, no `import`/`export`. It defines one global, `GameDNA_Weather`. Paste it into a `<script>` tag or load it with `<script src>`, without changing it. It owns the whole weather: five kinds (rain with splashes, snow, dust motes, fireflies, falling leaves), three depth layers (far and mid behind your sprites, near in front), a gusting wind, cross-fades, the particle budget, keeping off your UI, and the drawing. Your game keeps its own clock, camera and ground, and tells the module where they are.

Every particle position is a pure function of the seed, the module clock, the camera and the weather history; there is no per-particle state. So the same clock and camera always give the same pixels (`?t=&freeze=1` is stable), whatever step sizes got the clock there.

Optional look: load `skin-api.js` and a skin (e.g. `pixel16.js`) before it and pass `skin`. Colours come from the skin (`palette.weather.<kind>`, 4 colours each, if the skin has it; for leaves these are 4 leaf colours, outlines and veins are derived; else derived from `fx.cold`, `fx.heal`, `fx.crit`, `fx.hot`, `ink`, `paper`). Without the skin API it uses a built-in pixel16 look. A non-pixel skin (`pixel: false`) gets smooth rain lines, round flakes and soft firefly glows.

## API

`GameDNA_Weather.create(options)` returns an instance.

| option | meaning |
|---|---|
| `view` (or `bounds`) | Screen rect `{x, y, w, h}` in native canvas pixels the weather fills (clipped to it). Usually the play field. Any native resolution works. Without it: 256×224 at 0,0 and one warning. |
| `weather` | `'rain'` (default), `'snow'`, `'leaves'`, `'dust'`, `'fireflies'` or `'none'`. A few aliases work (`storm`, `blizzard`, `motes`, `petals`…); unknown names give `none` and one warning. |
| `seed` | Integer, default 1. |
| `ground` | Where things land. A number (one screen y for the whole width), or `x => y`: for a screen x, the screen y of the top of the ground under it (`null` over a pit: drops fall through). Rain splashes there, snow melts there, leaves rest there for a moment; far drops end a little above it (they are behind). **Omit it for a top-down view**: every particle then lands on its own seeded spot in the field. Called at most once per screen column per pass; it must be cheap and must not change game state. |
| `uiRects` | Array, or function returning an array, of screen rects `{x, y, w, h}` (HUD bars, windows, dialog boxes, buttons). No particle is drawn within 1 px of them (`uiMode: 'dim'` draws them at 50 % instead; that only shows when the weather is drawn after the UI or the UI is translucent). Read once per draw pass. |
| `skin` | Skin id or object (needs `GameDNA_Skin`). Omit for `pixel16`. |
| `params` | See below. |
| `onWarn(msg)` | Optional. Where warnings go (default `console.warn`, once per kind of problem). |

Callbacks may be missing; an exception inside one is caught and logged once, and the frame still draws.

| param | default | meaning |
|---|---|---|
| `density` | 1 | 0..2. Particle count multiplier. Counts scale with the view area (256×224 at density 1: rain 150, snow 130, dust 160, fireflies 44, leaves 60; rain and snow also × (0.55 + 0.9 × intensity)). |
| `intensity` | 0.5 | 0..1. Rain: fall speed 150–380 px/s and streak length 4–13 px; snow 16–50 px/s; leaves 18–40 px/s; dust and fireflies: brightness. |
| `wind` | 0.4 | −2..2. Base wind; 1 = 30 px/s (rain ×3, leaves ×1.15, snow ×0.8, dust and fireflies a little). Negative blows left. |
| `gust` | 0.35 | 0..1. Gust strength: slow swells and quick flutters on top of the base wind, always in the wind's direction. |
| `parallax` | 1 | 0..1.5. Depth parallax: layer factors far 0.55, mid 0.85, near 1.25 of the camera (0 = all move with the world). |
| `front` | 0.25 | 0..0.6. Share of the particles in the near layer (drawn by `drawFront`, over your sprites). 0 = everything behind the sprites. |
| `night` | 0 | 0..1. Fireflies glow (< 0.25 a faint cross over a dark body pixel, ≥ 0.25 a 1 px cross, ≥ 0.6 a 5×5 halo); dust dims slightly. |
| `shade` | 0 | 0..0.5. Rain and snow darken the view by this much with a cool tint, drawn by `drawBack` (so behind your ground and sprites, under the UI). |
| `fade` | 1500 | ms. Default cross-fade for `setWeather`. |
| `cap` | 180 | 20..400. The budget: never more particles than this across all layers and both passes, cross-fades included. |
| `splash` | 'on' | `'off'` = rain drops vanish at the ground without a splash. |
| `uiMode` | 'hide' | `'dim'` = draw particles over UI rects at 50 % instead of skipping them. |

| method | |
|---|---|
| `update(dtMs)` | Advance the weather clock. Call it once per fixed step with the step length (never real time). Pass 0 (or skip it) while your world is frozen. |
| `drawBack(ctx, camX = 0, camY = 0)` | Far and mid layers, and the storm shade. Call it **after your background, before tiles and sprites**. |
| `drawFront(ctx, camX = 0, camY = 0)` | Near layer. Call it **after your sprites and effects, before the HUD and windows**. |
| `draw(ctx, camX = 0, camY = 0)` | Both, for a game with one slot (e.g. a top-down map: after the map and sprites, before the HUD). |
| `setWeather(kind, fadeMs?)` | Cross-fade to another weather (`'none'` = clear). Counts move from the old to the new over `fadeMs` (default `fade`). Same kind again: nothing happens. Returns `weather()`. |
| `weather()` | `{kind, mix: [{kind, w}]}`: the target and what is on screen now (two entries during a fade). |
| `wind()` | Current wind in px/s (for grass, flags, smoke in your game). |
| `setParams(obj)`, `setView(rect)`, `setGround(g)`, `setUIRects(u)`, `setSkin(s)` | Live changes. |
| `clock()`, `reset(tMs = 0)` | Read / set the weather clock (`reset` also ends any fade). |
| `stats()` | Last frame: `{far, mid, near, back, front, total, splashes, resting, uiHidden, uiDimmed, shade, cap}`. |
| `lastDrawn(pass?)`, `layout(pass, tMs, camX, camY)`, `uiRects()` | For tests: the rects drawn by the last `drawBack` / `drawFront` (`[{x, y, w, h, layer, kind, state, dim}]`); the same list computed for any clock and camera without drawing; the UI rects read on the last pass. |
| `clear()` | No-op (accepted so generic reset code does not break). |

`camX` / `camY` are your camera position in world px (how far the view has scrolled right / down), the same number your tiles subtract (`worldX - camX`), not negated. A game without a camera passes `0, 0`.

## Integration (15 lines)

```js
// <script src="weather-particles.js"></script> before your game script (optional: skin-api.js + pixel16.js first)
const wx = GameDNA_Weather.create({
  view: { x: 0, y: FIELD_Y, w: FIELD_W, h: FIELD_H },             // the play field, below / beside the HUD
  seed: 1, weather: 'rain', params: { density: 1, intensity: 0.5, wind: 0.4, front: 0.25 },
  ground: sx => groundTopAt(sx + camX),                         // side view: screen y of the ground top, null over pits; omit for top-down
  uiRects: () => [hudRect, dialogOpen ? dialogRect : null]      // screen rects to keep clear (nulls are ignored)
});
function step() { /* existing world update, also run by ?t= fast-forward */ wx.update(1000 / 60); }
function render() {
  drawBackground();
  wx.drawBack(ctx, camX, camY);                                  // behind tiles and sprites
  drawTiles(); drawSprites(); drawEffects();
  wx.drawFront(ctx, camX, camY);                                 // in front of sprites
  drawHud(); drawWindows();
}
// a new area or a story beat: wx.setWeather('snow', 2000);
```

## Keep the rest of the game working

Only add calls; replace nothing. Every caller must keep working: `?auto=1` reaches the same ending (the module never reads input, adds no listeners and never changes game state), `?t=<ms>&freeze=1` shows the same frame every time (the clock advances only in the fixed step the fast-forward runs), keyboard shortcuts, pause (no `update` while paused), restart, title and result screens. If a screen should have weather (title, battle, results), draw it there too, with that screen's camera (`0, 0`) and its windows in `uiRects`. Draw it outside any screen-shake translate unless you want the weather to shake.

## Self-check without a browser

- The module file is byte-identical to the one you were given; it loads before the first `create`; `create` runs once (not per frame, not per level: use `setWeather`).
- `wx.update(stepMs)` sits in the fixed step that `?t=` fast-forward also runs; nothing passes `performance.now()` or `Date.now()` to the module.
- `drawBack` comes after the background and before the first tile or sprite; `drawFront` after the last sprite or effect and before the first HUD or window call; both get the same `camX, camY` the tiles use.
- `ground` returns **screen** y for a **screen** x: worked example, camera 200, ground tile column 20 (world x 320–335) has its top at y 148 → `ground(125)` = 148 (125 + 200 = 325 → column 20). Over a pit it returns `null`.
- `uiRects` covers every HUD bar and every window that can open over the field, in screen px, at the moment it is drawn.
- Identifiers inside `ground` / `uiRects` exist when first called (the first draw may come before your first update).
- No host function removed or renamed; the HUD is still drawn last.

## What it guarantees

- Same seed + clock + camera + view + params + weather history → the same pixels. Two `?t=&freeze=1` loads are byte-identical.
- Never more than `cap` particles (both passes and a cross-fade included); cost is O(particles) per frame, a few hundred `fillRect` calls at most.
- Nothing drawn outside `view`; nothing within 1 px of a UI rect (or only at 50 % with `uiMode: 'dim'`).
- Positions are whole native pixels; pixel skins use stepped fades (1, 0.75, 0.5, 0.25), never smooth alpha ramps.
- `draw*` never throws; a missing context or bad option logs one warning.
