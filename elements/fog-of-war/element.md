# B-03 Fog of war

## 1. What it is

On a tile map, only what the player's units can see is shown in full. Every other tile sinks under a fog layer: the terrain loses most of its colour, darkens toward a night blue and stays faintly readable, while two drifting layers of value noise move lighter mist patches slowly across it. On pixel screens the fog is an ordered (Bayer 4×4) dither, so its border is a one-tile band of thinning dots rather than a hard line or a blur. Enemies standing in fog are not drawn at all. The tile where an enemy was last seen keeps a faint silhouette of that unit (its own sprite, dithered and rimmed), which vanishes as soon as that tile is seen again. When an enemy comes into sight, a small "!" speech bubble pops above it. Each unit has its own sight radius; the game can block sight with terrain (forest, walls) and extend it (hills). When units move, tiles clear and fog over with a short fade instead of snapping.

It is an addon: it changes no rule. Hidden enemies still move, act and can be targeted by the AI; only drawing (or, if the game chooses, its rules) asks the module what is visible. Works for turn-based and real-time tile games: it needs a unit list, a fixed step and a draw call.

## 2. Default parameters

| Key | Default | Range | Meaning |
|---|---|---|---|
| `radius` | 3 tiles | 1–8 | Sight when the game passes no `visionOf` (or it returns nothing) |
| `shape` | diamond | diamond, circle, square | Sight area: Manhattan, round (r² + 0.8r) or Chebyshev |
| `density` | 0.6 | 0.3–0.85 | Opacity of the fog tint over terrain |
| `edge` | 1 tile | 0–1.5 | Width of the soft edge inside fogged tiles; 0 = hard tile edge |
| `drift` | 6 px/s | 0–20 | Mist drift speed |
| `fade` | 240 ms | 0–600 | Time for one tile to clear or fog over |
| `ghosts` | on | on, off | Last-seen silhouettes |
| `pop` | on | on, off | "!" bubble when an enemy comes into sight |
| `shroud` | off | off, on | Never-seen tiles 45 % darker than seen ones |
| `scheme` | night | night, mist, ash | Built-in fog colours (pixel16 look only; other skins use their palette) |

Module-only: `popMs` 1200 (pop life), `linger` 250 ms (an enemy stays shown that long after leaving sight), `dither` auto/on/off.

## 3. Variants

- **Classic 16-bit**: the defaults.
- **Unexplored shroud**: `density 0.75`, `edge 0.5`, `drift 3`, `fade 160`, `shroud on`: unexplored map is almost black, explored map is grey fog.
- **Morning mist**: `density 0.5`, `edge 1.5`, `drift 12`, `fade 400`, `scheme mist`: pale grey fog, wide soft border.
- **Battle smoke**: `density 0.7`, `edge 0.75`, `drift 8`, `scheme ash`: warm brown smoke.

## 4. Interface

**Needs**
- Map size in tiles and the tile size; the screen rect where the map is drawn (`view`, above the HUD) and the camera scroll.
- The unit list (array or function) and, per unit: its tile **where it is drawn** (`posOf`, round the walking position), its side (`isPlayer`), optionally its sight (`visionOf(unit, x, y)`, where terrain bonuses go), alive (`isAlive`), sprite (`ghostSprite`) and head anchor (`anchorOf`).
- Optional terrain callback `blocks(x, y)`: true = sight stops beyond this tile (the tile itself is seen).
- A fixed step (`update(ms)`), and two draw calls: `draw` under the units (after ground and range overlays), `drawGhosts` after the units.
- Optional `uiRects()` the pop must not cover and `getObstacles()` unit rects it should avoid.

**Provides**
- `isVisible(x, y)` and `isUnitVisible(unit)` for the game's drawing (and rules, if the game opts in).
- `onReveal(unit, x, y)` events; `ghosts()`, `isExplored(x, y)`, `pops()`, `visibleTiles()`, `stats()`, `lastDrawn()` for tests.

**Delivery (v1).** `module/fog-of-war.js` (one global, `GameDNA_FogOfWar`; API and a 15-line integration in `module/README.md`). Before the first `recompute`, every tile counts as visible and nothing is drawn, so a half-wired game never hides everything. Callbacks are wrapped; a throwing callback logs one warning and falls back to its default. The module reads no input. With `skin-api.js` loaded, colours come from the skin (`palette.fog.{deep, mist, ghost, ghostEdge}` if present, else `ink`, `ui.shadow`, `paper`, `text.accent`), and non-pixel skins (`pixel: false` or `overlayStyle.mode: 'wash'`) get a smooth wash instead of the dither. Verified on two hosts it had never seen (`checks/hosts/`).

## 5. Screen rules (exact numbers)

Native canvas 256×224 in the demo (map 256×192, 16 px tiles, HUD 32 px), integer-scaled with nearest-neighbour; the module works at any native size through `view` and `tile`.

- **Sight**: for each living player unit at tile P with radius r, a tile T is seen when T is inside the shape and either Chebyshev distance ≤ 1, or the Bresenham line P→T (or T→P) crosses no blocking tile other than its two ends. Default radius 3; the demo adds +1 for the scout and +2 on hills.
- **Fog level per tile** (`lv`): 0 seen, 1 seen before, 1.45 never seen with `shroud on` (else 1). Each tile moves toward its target by `dt / fade` per update (linear; 240 ms default). The first recompute after `create` or `reset` snaps.
- **Soft edge**: inside a tile with level o, each of its 8 neighbours with a lower level n pulls the pixel down to `n + (o − n) · min(1, d / edge)`, where d is the pixel's distance (in tiles) to the shared side or corner. The ramp lies entirely inside the fogged tile; seen tiles get no fog pixels.
- **Dither (pixel skins)**: coverage c = min(1, level). A pixel is fogged when c > Bayer4×4(x, y) (thresholds (k + 0.5)/16, world-anchored so it does not swim when the camera scrolls). Fogged pixels: colour = mist tone when noise > 0.5 + 0.22 · Bayer, else deep tone; alpha = `density` × max(1, level), × 0.9 where noise > 0.62.
- **Desaturation**: under every fogged pixel, a 50 % grey at alpha 0.7 is drawn with the `saturation` blend first (skipped where the browser lacks it).
- **Mist**: noise = 0.6 · N(x/2 + 0.5s, y/2 + 0.18s) + 0.4 · N(0.37x − 0.31s + 17, 0.37y + 0.27s + 29), s = `drift` × seconds; N = 64×64 tileable two-octave value noise built once (no randomness at run time).
- **Built-in colours** (deep / mist / ghost body / ghost rim): night `#0a102c` / `#283460` / `#b8c8f4` / `#5a6aa8`; mist `#3a4256` / `#8a92a6` / `#f0f2f8` / `#8a92aa`; ash `#1a1210` / `#4e3c32` / `#f0d4b0` / `#8a6a50`.
- **Ghost**: the unit's sprite as a silhouette, bottom-aligned and centred on its last-seen tile, mirrored if `flip`: body pixels in a checker of alpha 170/70 (ghost colour), a 1 px rim at alpha 210 (rim colour), whole sprite at 0.85 / 0.7 alpha alternating on a 4.4 s breathing cycle. Without a sprite: a 12×15 hooded figure.
- **"!" pop**: 8×11 bubble (ink outline, cream body, shaded bottom row, tail down-right, red "!" with a highlight). Anchor: centre of the unit's tile, 3 px above its top (or `anchorOf`). Candidates: above (bottom 1 px over the anchor), right of the head, left of the head, upper right, upper left, below the head; each clamped inside `view` (4 px from its top, so the rise never leaves it); score = 1000 × overlap with `uiRects` + 400 × overlap with any other unit on screen (its tile plus 4 px above; hidden enemies do not count, so the pop never hints at them) + 10 × overlap with `getObstacles` rects + 3 × candidate index; lowest wins. Motion: rises from +5 px to −3 px in 70 ms, settles to +1 at 120 ms and 0 at 160 ms, holds, blinks every 50 ms in its last 200 ms, gone at `popMs` (1200 ms). It follows the unit while it walks in sight and is removed the moment the unit leaves sight.
- **Linger and repeat**: an enemy stays shown for `linger` (250 ms) after leaving sight; a unit seen again less than 1 s after it was last in sight gets no second pop.
- **Draw order**: ground and terrain → (range overlays) → `draw` (fog) → units (hidden enemies skipped) → `drawGhosts` (silhouettes, then pops) → cursor → HUD and banners.

## 6. Common mistakes (symptom → fix)

- Everything is fogged, even around the player's units → `isPlayer` matches nobody, or `posOf` returns pixels; it must return tiles.
- An enemy pops into view only after it finishes walking → `posOf` returns the logical tile; return the tile where it is drawn.
- A hidden enemy's HP bar, shadow or info window still shows → guard every unit draw path with `isUnitVisible`, not only the sprite.
- Sweeping the cursor finds hidden enemies (the cursor vanishes, changes colour, stops or opens a window on their tile) → treat a hidden unit as an empty tile everywhere the game reacts to a unit under the cursor. Hidden means the player can't learn anything about the unit: no sprite, HP bar, shadow, selection/hover highlight, cursor change, info window, sound, camera move, or blocked cursor movement on its tile. Draw the cursor and every hover effect on fogged tiles exactly as on an empty tile.
- Autoplay ends differently after adding fog → a rule or AI read the fog or a filtered list; only drawing may ask the fog.
- Fog missing in `?t=&freeze=1` shots → `update` is not in the replayed fixed step.
- Fog border looks like a staircase of hard squares → `edge` 0, or levels snapped; use `edge` ≥ 0.75 and a non-zero `fade`.
- Fog border blurs on a pixel screen → a smooth alpha ramp; dither it (ordered, world-anchored), do not blur.
- Dither pattern crawls when the camera scrolls → anchor the Bayer index to world pixels, not screen pixels.
- Terrain under fog is unreadable mud → keep `density` ≤ 0.75 and desaturate rather than darken more.
- Ghost looks like a live enemy → silhouette only (no team colours), dithered body, faint rim; never an HP bar.
- "!" pops twice as a watcher walks past an enemy at the edge → linger and a 1 s repeat guard.
- "!" keeps floating where an enemy went back into the fog → remove the pop when its unit leaves sight.
- "!" sits on the unit standing above the revealed one and reads as theirs → score candidates against every other unit on screen and move beside the head.
- Fog drawn over the units or the move arrow → draw it under them (after ground and overlays), ghosts and pops after.
- Old ghosts after a restart → `reset()` where new units are built.

## 7. Acceptance moments

| Shot | Must be visible |
|---|---|
| `demo/?t=500&freeze=1` | Three heroes in a clear diamond-shaped area on the west bank; everything else fogged, desaturated, with lighter mist patches and a dithered one-tile border; terrain (trees, river, walls) readable; no enemy drawn. |
| `demo/?t=2800&freeze=1` | The scout at the east bridge; a "!" bubble above the raider just across the river; the raider passed on the road is now a faint silhouette at its last-seen tile. |
| `demo/?t=7200&freeze=1` | Scout back west; two silhouettes in fog; the archer on the hill (vision 5) clears a wide area; `HUD: LAST SEEN 2`. |
| `demo/?t=9700&freeze=1` | A raider stepping out of the southern forest is revealed with a "!"; forest tiles stop sight beyond them. |
| Cursor sweep over fog (any host) | The cursor, hover highlight and windows look exactly as on empty tiles, also on tiles holding hidden enemies. |
| `&xray=on` at 7200 | Dashed boxes where hidden enemies stand (proves they exist and are only hidden). |
| `&forest=off` vs default at 2200 | Without forest blocking, sight reaches through the woods. |
| `&shroud=on&density=0.75&edge=0.5`, `&scheme=mist`, `&scheme=ash`, `&edge=0`, `&skin=flat` | The variants: near-black unexplored map; pale mist; brown smoke; hard tile edge; smooth wash with no dither on a non-pixel skin. |
| Phone width 500 px | Canvas fits without horizontal scroll at a whole-number scale. |
| Unseen hosts (`checks/hosts/`) | Tactics host and grid starter: `?auto=1` same ending as without fog, 0 errors; hidden enemies not drawn; reveals with "!". |
