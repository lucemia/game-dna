# B-05 Level-select path reveal

## 1. What it is

An overworld map scene between the levels of a game. Nodes sit on a small island or coast: the start sign, levels (yellow discs), levels with a secret exit (red discs), bonus levels (pink discs with a star), save huts, shops and a castle for the last level. Stepping-stone paths join them. The hero walks node to node along open paths with a four-frame walk; confirm enters a level through an iris. When the game reports the level cleared, the map comes back, the iris opens on the hero and each newly opened path is drawn one stone at a time, a puff and a tick sound per stone, while the camera follows the stones; the next node pops in with sparkles and the cleared node turns blue and raises a flag. A secret exit opens a different path. Locked paths one step ahead show as faint stones leading to a grey padlocked node. An info panel names the node under the hero (or the one being walked to, or hovered) with NEW / CLEAR, two exit pips for secret levels, the game's collected items and the key hint. Huts save through the game (SAVED toast), shops call the game. A map bigger than the screen scrolls, with blinking arrows at the edges.

It is a system element: the module owns the graph state, walking, the reveal, the camera and all map drawing (built-in coastal terrain made from the node positions, or the game's own ground). The game owns its levels, the scene switch, saving and sounds, and reports each level's result with `complete(id, exit)` or `fail(id)`.

## 2. Default parameters

| Key | Default | Range | Meaning |
|---|---|---|---|
| `walk` | 1.25 | 0.5–3 | hero walk speed on the map, px per frame |
| `reveal` | 4 | 1–12 | frames between two stones of a revealing path |
| `spacing` | 6 | 4–10 | px between stones |
| `terrain` | coast | coast, dusk, none | built-in ground (none = the game's `drawGround`, or a plain fill) |
| `locked` | faint | faint, hidden | show the next locked path and node faintly, or nothing |
| `panel` | auto | auto, top, bottom, off | info panel position (auto = bottom unless it would cover the hero or a game rect) |
| `iris` | on | on, off | iris close before `enterLevel`, iris open when the map returns |
| `camera` | smooth | smooth, instant | camera easing (0.14 per frame) or snapping |

## 3. Variants

- **Coastal trail** (defaults): green coast, cliffs on south shores, 4-frame stones, faint locks, bottom panel.
- **Quick reveal**: walk 2, reveal 2: short stops between levels.
- **Dusk coast**: evening palette, slower stones (6 frames), panel fixed at the bottom.
- **No spoilers**: locked paths hidden, panel on top, wider stone spacing.

Shown with the same module: the demo (stand-in levels), the starter Gullwing Trail (platformer levels, boss, shop) and the unseen side-scroller Cliffside Run split into four levels at its checkpoints plus a bonus replay (`checks/hosts/sidescroll/`).

## 4. Interface

**Needs**
- A scene switch: title → map → level → map … → castle cleared → the game's win screen.
- The graph: `nodes` `{id, x, y, kind, name}` in map px (kinds start, level, secret, bonus, castle, hut, shop) and `edges` `{a, b, via, exit: 'normal' | 'secret'}`. An edge opens when `a` is cleared through that exit; edges out of start, hut and shop open as soon as the node is reached.
- The cleared state to start from (`cleared` list or object, or a whole saved `state`), or nothing for a new game.
- `enterLevel(id)`; then `complete(id, 'normal' | 'secret' | 'both')` or `fail(id)` when the level ends.
- Input while the map is shown: four held directions and a confirm press per 60 Hz step (`update(input)`), or `key()` / `press()`; optional pointer (`click`, `hover`).
- Optional: `onSave(state)`, `onShop(id)`, `onSound(name)`, `onEvent(ev)`, `nodeInfo(id)` items, `auto` (the game's autoplay flag), `enabled()`, `avoid()` rects, `drawGround`, `drawPlayer`, `drawOver`, `labels`, `skin`.

**Provides**
- `enterLevel` after the iris; events leave, arrive, enter, reveal, revealDone, clear, fail, save, shop, deny, allClear; sound cues step, arrive, dot (per stone), open, enter, save, shop, deny.
- `getState()` `{at, cleared, open, saves}` for saving; `player()` (the map hero's screen box), `getUIRects()` (panel, toasts), `camera()`, `toScreen()`.
- An autopilot: nearest uncleared level by open paths (castle last), stopping once at each unused hut to save.

**Delivery (v1).** `module/level-select-map.js` (one global, `GameDNA_LevelMap`; API and integration in `module/README.md`). Draws windows and text through `GameDNA_Skin` when `skin-api.js` is loaded, else a built-in copy of pixel16. Robust to sloppy integration: node and edge field aliases (`from`/`to`, `points`, `pos`, kind aliases), edges naming missing nodes are dropped with one warning, callbacks are wrapped (one warning each), `update`/`draw` never throw, a confirm held from the level must be released first, and drawing 30 frames while a level is open shows the map again with a warning.

## 5. Screen rules (exact numbers)

Native canvas (256×224 in the demo and starter, 320×180 on the unseen host), integer-scaled, whole pixels.

- **World**: the nodes' bounding box + 28 px right and below (+30 more below for the bottom panel), or `world` if larger. Camera target = hero (or the stone being revealed, or the node a queued reveal starts from) at 50 % width and 44 % height (55 % with the panel on top); clamped to the world; centred when the world is smaller than the view.
- **Terrain (coast)**: land = noisy union of 34 px discs at nodes and 24 px discs every 6 px along every path (so paths are always on land); sand on north/east/west shores, a 6 px rock cliff (5 tones, vertical striations) under every south-facing shore, foam 1 px off land, shallow ≤ 4 px, deep beyond with dithering; shore foam pulses every 20 frames; deep-water glints. Trees, pines, rocks and bushes on a 9 px jittered grid, ≥ 17 px from nodes and ≥ 11 px from paths.
- **Stones**: every `spacing` px from 9 px after the start node to 8 px before the end node; open stone 4×3 dark base, 2×2 sand top, 1 px highlight; the newest stone 5×4 bright for 3 frames; a white plus spark on the next stone; 2 dust pixels per stone. Faint: the same stone at alpha 0.42.
- **Nodes**: 15×10 flat disc with a 2 px rim (yellow level, red secret until both exits, blue cleared, pink bonus, grey locked at alpha 0.5 with a 7×8 padlock); cleared levels a 11 px pole and a waving 2-row pennant (red, pink after a secret exit); uncleared levels a blinking white ring. Castle 30×36 (two towers, a wall, a roofed keep, a gate) standing behind its disc so a hero at the gate hides only the gate, with a waving flag (red, white when cleared), hut 16×14 with chimney smoke, shop 16×14 striped tent, start sign 12×14 beside the disc. A revealed node pops (-5 px to 0 over 6 frames, bounce) with 6 sparkles for 24 frames.
- **Hero**: 12×17, outline 1 px, down / up / side (mirrored for left), stand + 2 walk frames switching every 8 frames, 1 px bob, 2 px hop for 90 frames after a clear; steps every 16 frames with a dust pixel; a 4-frame shake when a direction or confirm is refused.
- **Panel**: width min(view − 8, 232), height 30, centred, 4 px from the bottom (or top). Row 1 (y + 5): badge (disc or 7×7 icon), name (cut to fit) in title colours, status right (CLEAR green, NEW yellow, castle red) with two 4×6 exit pips for secret levels. Row 2 (y + 17): up to 4 items `icon have/total` (green when complete) or the first line; at the right, the key cap (`Z`) and ENTER / SAVE / SHOP when the hero stands there and nothing is moving.
- **Toasts**: plate, text + 14 px, top centre 9 px down (below a top panel), slide 2 px per frame for 8 frames with stepped alpha, 120 frames, alert plate for SECRET PATH; at most 2.
- **Iris**: 24 frames each way, radius ∝ k^1.6 of 0.75 × the view diagonal, centred 8 px above the hero's feet, gold 1 px rim.
- **Timing**: a 60 px path at defaults reveals in 9 stones × 4 = 36 frames + 18 frames hold; reaching a node, held directions continue after 8 frames unless it is an uncleared level.
- **Scroll arrows**: 5×9 (sides) or 9×5 (top / bottom) gold arrows with an ink outline, always shown while the camera can scroll that way, bobbing 1 px every 32 frames.
- **Draw order**: ground → paths → nodes (by y) → hero → particles → `drawOver` → (game effects) → scroll arrows → panel → toasts → iris.

## 6. Common mistakes (symptom → fix)

- Page error "Identifier 'map' has already been declared" → the game already has a `map` (often its tile map); name the instance `worldMap`.
- The hero never moves → `update` is not called while the map is shown, or up/down never reach it (many platformers ignore up/down); pass all four held directions.
- A level starts again the instant the map returns → the result screen's confirm was passed as held; pass this step's press (the module also waits for a release after `show`).
- Lives or score reset between levels → `enterLevel` ran the whole new-game reset; keep the run state and reset only the level.
- `?auto=1` stops on the map → `auto` not passed; the game's own autopilot does not drive the map.
- The win screen never shows → the castle's clear went back to the map; route it to the game's win scene (and still call `complete` for the save).
- A path never opens → its edge's `a` is not the level that was cleared, or the clear was reported with the wrong exit (`'secret'` only opens secret edges; use `'both'` for both).
- Paths drawn through the sea → the terrain is built from the nodes and paths; give long paths `via` points instead of moving nodes; or draw your own ground with `drawGround`.
- The panel covers the game's HUD → return the HUD rects from `avoid()`.

## 7. Acceptance moments

| Shot | Must be visible |
|---|---|
| `demo/?t=300&freeze=1` (`shots/01`) | Start sign, the hero, the open stones to Gull Steps (yellow disc), a faint path to a grey padlocked node; panel TRAILHEAD / START; scroll arrows. |
| `demo/?t=4400&freeze=1` (`03`) | The path from Gull Steps (blue, flag) to Tide Caves half drawn, a bright newest stone, the spark on the next one; camera on the stones; PATH OPEN. |
| `demo/?t=10000&freeze=1` (`04`) | The secret path from Tide Caves to Seal Cove being drawn after the hut path; SECRET PATH on the alert plate; panel with both exit pips lit, coins 8/10 and gem 1/1. |
| `demo/?t=2000&freeze=1` (`05`) | The iris closing on the hero at a level node, gold rim. |
| `demo/?t=50000&freeze=1` (`07`) | Every level blue with flags, the castle with a white flag, the hero at the castle, panel STORM KEEP CLEAR with the Z ENTER key cap. |
| `demo/?…&skin=flat` (`09`) | The panel and toasts drawn by a token-only smooth skin (every window and text goes through the skin). |
| `starter/?t=24500&freeze=1` (`13`) | Gullwing Trail map after the first level, PATH OPEN, run plate top left. |
| `starter/?t=32500&freeze=1` (`15`) | Tide Caves (cave backdrop, brick pillar, crystals), the key in the HUD plate. |
| `starter/?t=6000`, `86000`, `133000` (`16`, `16b`, `16c`) | Levels by day and at dusk (parallax cliffs and sea, shaded ground, props, 16×22 hero, coins along the path) and the Warden fight at night in the rain. |
| `starter/?t=139000&freeze=1` (`17`) | Ending over the finished map: 6/6 levels, secret exits 1/1, 1 save. |
| `checks/hosts/sidescroll` `?t=20000&freeze=1` (`21`) | The unseen 320×180 side-scroller's map: Bat Hollow cleared (red, flag, 3/4 coins, secret not found), the hut, the faint castle. |
| 500 px wide (`11`, `18`) | Demo and starter fit at 1× (starter) with no horizontal scroll. |
