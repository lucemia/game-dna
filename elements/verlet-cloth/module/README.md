# verlet-cloth.js (E-12 module, v1.2)

One plain script, no dependencies, no `import`/`export`. It defines one global, `GameDNA_Cloth`. Paste it into a `<script>` tag or load it with `<script src>`, without changing it. It adds **capes, scarves, ribbons, hair tufts and plumes, banners and flags, hanging ropes and chains** that swing with movement and wind: a small Verlet (position-based) solver with points and distance constraints, a single strand for ropes and scarves or a 2D grid for capes and banners, pinned to an **anchor** you give it (a point on an actor or a fixed post), with gravity, damping, wind gusts from game time, a ground line, solid rects and an optional body circle the cloth drapes over. On HD games it paints the cloth (v1.2): a smooth silhouette through the points, light and dark fold bands from how each segment faces a light direction, a darker back face and fold shadow, a gradient along the length, brush strokes fixed in cloth coordinates, a light rim on the lit edges, a thin edge line in a darker hue of the cloth, a trim band, and twisted strands on ropes. On pixel games it draws crisp whole pixels with a 1 px outline and three tones (unchanged).

It only **reads** anchors and only **draws**. It never reads or writes your game state, hit boxes, timers, RNG or input, so collisions, damage and autoplay endings are exactly as before. Everything advances in `update(dt)` in fixed 1/120 s sub-steps of game time (no `Math.random`, no wall clock), so `?t=<ms>&freeze=1` shows the same frame every time. When an anchor jumps farther than the teleport distance in one update (respawn, room change, blink, restart), the piece is re-posed hanging from the new anchor at rest instead of stretching across the screen; when the anchor function returns `null` the piece is hidden and shown again in its rest pose.

Cost (headless Chromium, 2026-11-16): a cape is ~45 points, a scarf ~9. The demo's 8 pieces (167 points, 520 constraints) take ~0.13 ms per 60 Hz step; 40 pieces (20 capes + 20 scarves, 1260 points) ~0.6 ms. Pixel mode adds one small `getImageData` per piece per draw. Drawing (v1.2, 2026-11-17, forced raster, median of 3): the demo's 8 pieces take ~0.65 ms per frame at 1x and ~1.25 ms at 2x (v1.1: 0.29 / 0.41 ms); `look: 'flat'` costs what v1.1 did. Drawing uses only the points from `update()`: no time or random numbers, and colour ramps, blotches and strokes are cached per piece.

Optional look: load `skin-api.js` and a skin and pass `skin`: the skin's ink (`outline.sprite.color` or `palette.ink`) colours the outline (on HD a piece with an `ink` of its own, or a skin's ink, keeps that colour and the ink line's weight; without one the edge is a thin line in a darker hue of the cloth), `outline.sprite.width` 0 turns outlines off, a pixel skin turns pixel mode on, and `palette.team.a` is the default colour. Without `skin`, nothing from a skin is used.

## API

`GameDNA_Cloth.create(options)` returns an instance.

| option | meaning |
|---|---|
| `params` | `wind` 0.5 (-3..3, + blows right; 1 = a stiff breeze), `gust` 0.5 (0..1, how much the wind varies over time and space), `stiffness` 0.8 (0..1, solver iterations and stretch), `damping` 0.03 (0..0.3 per frame), `gravity` 1 (0..3), `segments` 8 (2..24, along each piece unless `attach` sets its own), `drape` 0.5 (0..2, how much capes, scarves and hair lean toward the actor's back), `shade` 1 (0..1, fold shading; 0 = flat colour), `texture` 1 (0..1, v1.2: brush strokes, soft blotches and rope strands; HD only), `look` `'painted'` \| `'flat'` (v1.2; `painted`, the default, is the HD drawing described above; `flat` is the v1.1 drawing, one flat tone per segment and an ink outline, for flat vector art), `outline` `'auto'` \| `'on'` \| `'off'` (painted look: the thin edge line), `snap` `'auto'` \| `'pixel'` \| `'smooth'` (`auto` = pixel when the context you draw on has `imageSmoothingEnabled === false`), `reduced` `'system'` \| `'on'` \| `'off'` (less wind, no gusts, more damping), `view` `'auto'` \| `'side'` \| `'top'` (`auto`, the default: a piece whose anchor returns `fx, fy` uses top-down physics, one that returns only `facing` uses side view; top-down = capes hang down the screen and stir, drape against `fx, fy`, no lift), `teleport` 0 (px; 0 = auto: max(1.25 × length, 36 × scale)). |
| `scale` | Size of your world: px per unit, about `viewHeight / 360` (0.5 for a 180 px tall pixel game, 1 for 360, 2 for 720). Gravity and wind scale with it. Or pass `view: {w, h}` and it is computed. Number or function. Default 1. |
| `light` | v1.2, optional. `{x, y}`, `[x, y]` or a function returning one: the direction **toward** the light in screen coordinates (y down). Default `{x: -0.45, y: -0.89}` (top left). Shades every piece on HD; pixel mode ignores it. `setLight(x, y)` changes it later. |
| `camera` | `() => ({x, y})`: subtracted from world coordinates when drawing. Leave it out if you draw inside your own camera transform (then world = draw coordinates). |
| `ground` | Number or `(x) => y`: a floor line in world coordinates (nothing passes below it). An anchor may also return `ground` per piece. |
| `solids` | `() => [{x, y, w, h}]` in world coordinates: rects the cloth is pushed out of (walls, crates). Optional, keep it short (rects near the pieces). |
| `skin` | Skin id or object (needs `GameDNA_Skin`). Omit or `false` to ignore skins. |

| method | |
|---|---|
| `attach(id, opts)` → id | Add (or change) one piece. `kind`: `'cape'`, `'banner'` (or `'flag'`), `'scarf'`, `'ribbon'`, `'hair'`, `'tail'`, `'rope'`, `'chain'`. `anchor`: `() => ({x, y, facing, fx, fy, ground, layer, alpha})` or `null` to hide (see below), or a fixed `{x, y}`. `length`, `width` (px; for a banner, `width` is its height along the pole), `segments`, `cols` (grid columns, 2..8), `color`, `color2` (back side), `trim` (hem / fringe), `ink`, `outline`, `layer` (`'back'` \| `'front'` \| `'auto'`), `group` (e.g. the actor id; `draw` filters by it), `taper`, `stiffness`, `drag`, `drape`, `mass`, `lift` (0..2, upward pull from the actor's speed through the air, below the pin only; capes 0.3, scarves 0.8), `flutter` (0..3, travelling ripple; banners 1, capes 0.5; a flag that should fly level and ripple: `flutter: 2, drag: 2`), `body` (`[dx, dy, r]`: a circle relative to the anchor that the cloth drapes over, `dx` toward the facing side; side view: a half-disc on the back below its centre, never holding cloth up), `rigid` (true = settle once in still air and carry that shape rigidly: baked art, far-away actors, a cheap mode), `collide` (false = ignore `ground`/`solids`), `teleport`, `alpha`. Calling it again with the same id changes only what you pass (a new length / width / kind / segments re-poses the piece). |
| anchor fields | `x, y` world px (where the cloth is pinned: shoulders for a cape, neck for a scarf, back of the head for hair, the pole top for a banner, the beam for a rope). `facing` 1 \| -1 (the side the actor faces; capes drape the other way; a banner flies toward `facing`). Top-down: `fx, fy` = the unit vector the actor faces. `ground` = a floor y for this piece: the floor under the actor (its feet y while standing), **never the screen bottom**; ground lines above the anchor (the actor fell below them) or out of the piece's reach are ignored. Top-down: leave it out (a floor at the feet makes a cape lie flat sideways like a wing). `layer` overrides the piece's layer this frame. `alpha` 0..1 (e.g. your hurt blink). Return `null`, `false` or `{visible: false}` to hide the piece (dead, off-level, title screen). Bad numbers (NaN) keep the last good anchor. |
| `update(dtMs)` | **Once per fixed step, after your actors moved** (the step `?t=` fast-forward and `?auto=1` also run). Reads every anchor once, detects teleports, runs fixed 1/120 s sub-steps. |
| `draw(ctx, layer, group)` | Draw pieces whose layer is `layer` (`'back'`, `'front'`, or `null`/`'all'` for every layer) and whose group or id is `group` (string, array, function, or omitted = all). Capes and hair go behind the body: `draw(ctx, 'back', id)` right before the actor's sprite; scarves in front: `draw(ctx, 'front', id)` right after it. Static props: `draw(ctx, 'back', 'props')` where your scenery is drawn. Never throws. |
| `impulse(idOrGroup, vx, vy)` | Kick a piece or a group, px/s (at scale 1): a swing, a dash, a hit, an explosion. Stronger toward the free end. |
| `gust(strength, ms, dir)` | A temporary extra gust everywhere (0..4, fading over `ms`, `dir` 1 \| -1). |
| `snap(idOrGroup?)` | Re-pose at the anchor now, at rest. `clear()`: every piece re-poses at its next anchor (level start, restart). |
| `detach(id)`, `detachGroup(g)`, `has(id)`, `ids()` | Remove pieces (removed actors). |
| `points(id)`, `tip(id)` | World points `[{x, y, pinned}]`; the free end's middle point (hang a lantern or a bell on it). |
| `wind(x, y)` | The wind at a point now, px/s: let grass, smoke or particles lean with the same wind. |
| `setLight(x, y)` | v1.2: change the light direction (also `setLight({x, y})`); returns false on bad input. |
| `setParams(o)`, `params()`, `reduced()`, `stats()`, `list()`, `lastDrawn()` | Live params; counters `{attached, points, constraints, updates, substeps, draws, drawn, snaps, resets, hidden, anchorErrors, badInput, maxStretch, maxReach, clamped, collisions, drawErrors, selfAdvanced}`; per piece `{id, group, kind, layer, visible, anchor, pinErr, finite, bbox, maxStretch, reach, maxReach, snaps}`; last drawn screen rects with `owner` = group. |

## Integration (15 lines)

```js
// <script src="verlet-cloth.js"></script> before your game script
const cloth = GameDNA_Cloth.create({ params: { wind: 0.5, gust: 0.5 }, scale: VIEW_H / 360,
  camera: () => ({ x: cam.x, y: cam.y }), ground: GROUND_Y });                 // leave camera out if you draw inside a camera transform
cloth.attach('hero-cape', { kind: 'cape', group: 'hero', length: 26, width: 14, color: '#9c2f3a', trim: '#e0b450',
  anchor: () => hero.alive ? { x: hero.x - hero.facing * 3, y: hero.y - 20, facing: hero.facing } : null });
cloth.attach('flag-1', { kind: 'banner', group: 'props', anchor: { x: 400, y: 120, facing: 1 }, length: 40, width: 24 });
function fixedStep() {                                                         // your 60 Hz step (also run by ?t= and ?auto=1)
  /* ...existing input, movement, collisions... */
  cloth.update(1000 / 60);                                                     // after the actors moved
}
// existing hooks, one line each: swing / dash start -> cloth.impulse('hero', -facing * 200, -40)
function drawActor() {
  cloth.draw(ctx, 'back', 'hero');  drawHeroSprite();  cloth.draw(ctx, 'front', 'hero');
}
// scenery pass: cloth.draw(ctx, 'back', 'props');  level start / restart: cloth.clear();
```

## Keep the rest of the game working

- **Rules stay where they are.** Never feed cloth points into positions, collision, damage or AI. The cloth reads anchors; the game never reads the cloth (except `tip()` for drawing a lantern).
- Call `update` from the fixed step, after movement, on every scene that shows cloth (title, play, menus that keep the world visible). Not from the render loop: `?t=<ms>&freeze=1` runs the step N times and draws once, and must show the same frame every run.
- Anchors are functions, so they follow the actor without extra calls. Look the actor up inside the function if your game rebuilds its actor objects on restart (`() => { const e = enemies.find(q => q.id === id); return e && e.alive ? {...} : null; }`), otherwise the closure keeps pointing at the old object.
- Return `null` from an anchor while the actor is dead, despawned, in another room or the title is showing. Detach pieces of actors that are gone for good.
- **Always pass a group** to `draw()` beside a sprite: `draw(ctx, 'back')` with no group draws every piece in the game there. Guard sprites without an id (title-screen previews): draw no cloth for them.
- If the game already draws a fixed cape, banner or rope, skip that old drawing with a condition while the cloth runs (`if (!cloth) { ...old fill... }`); don't delete it.
- Find every caller of what you touched: autoplay (`?auto=1`), `?t=` fast-forward, restart, respawn, title, pause. Hook, don't replace: keep every function, name and caller, and the game's own blink and knockback. Draw cloth inside the same `globalAlpha` your hurt blink uses (or pass `alpha` in the anchor).
- Coordinates: anchors, `ground` and `solids` are world px (the same coordinates as your actors' positions). If you draw with a camera offset subtracted by hand, pass `camera`; if you draw inside `ctx.translate(-cam.x, -cam.y)`, don't.
- HD games get the painted look (v1.2). Set the light once to match your scene (`light: {x, y}`, toward the light). On flat vector art with thick ink lines, pass `ink` per piece (it keeps your line colour and weight) and, if the brush texture is too much, `texture: 0` or `look: 'flat'`.
- Pixel games: leave `snap: 'auto'` and keep `imageSmoothingEnabled = false` on the canvas you draw on; pieces are then rasterised at whole native pixels with a 1 px outline. Small sprites want short, narrow pieces (a 2-3 px scarf on a 14 px hero).

## Self-check without a browser

- The module file is byte-identical to the one you were given and loads before `create`.
- `cloth.update(STEP)` runs once per fixed step, after movement, in the step (not in render), on every scene that draws cloth.
- Every `draw(ctx, layer, group)` sits next to the sprite or scenery it belongs to; capes / hair before the body, scarves after it; HUD and menus drawn after all cloth.
- Every anchor returns world px of something that exists, or `null`; none falls back to (0, 0) or the screen centre.
- Restart, respawn and level change: the actor's position jumps, so the cloth snaps (stats().snaps grows); no `clear()` is needed, but it is harmless.
- No game variable reads `points()`, `list()` or `lastDrawn()`.
- Walk one cape with the defaults: actor standing, no wind: the cape hangs from the anchor to `length` below it (leaning back by `drape`); running at 200 px/s at scale 1 it trails about 45 degrees behind.

## What it guarantees

- Pinned points sit exactly on the anchor (`list()[i].pinErr` 0). Extra strand-only solver passes keep strands within ~2 % of rest (`checks/soak.py`: 120 s, 7 presets, max 1.021, clamps 0); as a safety net no strand gets longer than 1.3× its rest length in any frame, whatever the forces; a piece whose points become non-finite or reach beyond 1.5× its maximum is re-posed at its anchor (`stats().resets`).
- An anchor jump larger than `teleport` px between two updates re-poses the piece hanging from the new anchor (`stats().snaps`), so no line is ever drawn across the screen.
- No input listeners, no timers, no `Math.random`, no wall clock. `update`, `draw`, `attach`, `impulse` never throw on bad input; anchor and solid callbacks that throw are counted in `anchorErrors` and treated as hidden.
