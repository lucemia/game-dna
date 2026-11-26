# npc-generator.js (GameDNA_NpcGen v2.0.1)

Seeded townsfolk for a pixel game: each person is built from parts (age, body type, skin, hair style and colour, top, legs,
shoes, headwear, glasses or beard, a satchel or scarf) and hand-pixelled in code in ONE style, with a 4-frame walk in four
directions, a name and a one-line trade. The same seed always gives the same person, on every machine and at every screen
size. Talking to one shows a **talk panel**: a dialogue box at the bottom of the screen (or the top when the speakers stand
low) with the person's own pixel portrait, name, trade and line, plus a small speech marker over the talker's head. One
classic script, no dependencies, ASCII only, one global `GameDNA_NpcGen`; it never calls `Math.random` or reads the clock.
Include it verbatim (`<script src="npc-generator.js">` before the game script, or pasted unchanged).

**Size.** A grown-up is about 24 px from shoes to crown (children about 19, hats up to 28), drawn in a 32 x 44 frame: it suits
16 px tile worlds. In a bigger world (40 px tiles, 640 px wide view) pass `scale: 2` (the panel scales with it). Pixels always
land on whole device pixels whatever the game's canvas transform (a 640 px game shown on a 1920 px canvas, phones with dpr 3):
never scale them yourself. People stand on the feet point you give: `feetY` is the row under the shoes.

## The town helper (most games only need this)

```js
const town = GameDNA_NpcGen.town({
  seed: 7, count: 8,                                  // same seed = same people in the same places
  area: { x: 32, y: 32, w: 224, h: 160 },             // world px where they may walk (or a function)
  blocked: (x, y) => isSolidAt(x, y),                 // the game's own wall / prop test for one world point
  scale: 1, speed: 22                                 // px per second (in world px / scale)
});
function step(dt) { /* fixed step, also the ?t= replay */  town.update(dt, { x: hero.feetX, y: hero.feetY }); }
// drawing, inside the game's depth sort (y = feet, world px); the talker's marker is drawn with it:
for (const d of town.drawables(camX, camY)) sprites.push({ y: d.y, draw: () => d.draw(ctx) });
// talking (the game's own key, after the game's own targets):
if (town.talking()) town.release();
else { const f = town.nearest(hero.feetX, hero.feetY, 24); if (f) town.talk(f, { x: hero.feetX, y: hero.feetY }); }
// the talk panel, every frame after the world (screen space, before the game's menus and windows):
town.panel(ctx, camX, camY, { view: { x: 0, y: 0, w: VIEW_W, h: VIEW_H }, avoid: hudRects });
```

Townsfolk walk in straight 4-direction legs with pauses and a look round, step round anything `blocked` reports, keep their
feet at least 14 px apart side to side and 22 px front to back from each other and from the player you pass to `update()`
(`gapX`, `gapY`, times `scale`), step out of the way when the player walks into them, and are **not solid** for the player, so the
game's own movement, autoplay and paths do not change. When the player walks into a person and talks, the person first steps
aside (16 px beside the player, or 24 px above / below, at 5x walk speed, about 0.15 s, one axis then the other) so
the two never overlap; the panel opens once it stands and faces the player. While talking
a person keeps facing the player until `release()`, until
the player walks `leave` px away (default 48 x scale), or until `talk(f, who, ms)` runs out.

| call | what |
|---|---|
| `town({seed, count, specs, area, blocked, scale, speed, stride, spawn, talkMs, leave, minDist, shadow, avoid})` | `specs` = your own list instead of `count` (from `make` / `crowd`); `spawn` = `[{x, y}]` start points, otherwise free spots in `area`; `leave` = how far the player may walk before a talk ends (0 = never); `avoid` = specs nobody may look like or share a trade with (the player) |
| `town.update(dtMs, player)` | wander one step and advance the talk (panel slide-in, typewriter); call it where the world updates, skip it while the game is paused |
| `town.drawables(camX, camY)` | `[{y, id, npc, draw(ctx)}]` for the game's own depth sort; `town.draw(ctx, camX, camY)` draws them sorted among themselves |
| `town.nearest(x, y, r, skipIds)` | the person whose feet are nearest within `r` world px, or `null` |
| `town.talk(f, who, ms, {at})` | stop and turn to `who` (`{x, y}`; when it stands where the player stands, the live player from `update()` is used). `ms` 0 = until released. `at` = a spot `who` is still walking to: the person waits turned to it, nobody steps into it, no panel yet; call `talk` again on arrival. Returns `{name, title, role, line, seed}` |
| `town.release()` / `town.talking()` | end the open talk (the panel fades out in 0.14 s) / the person talking now, or `null` |
| `town.panel(ctx, camX, camY, {view, avoid, scale})` | draws the talk panel: full width of `view` up to 300 art px, 56 art px tall, at the bottom (4 px margin) or at the top when the speakers (and the marker) would be under it; steps past every `avoid` rect (the HUD: array or function, screen px); slides in over 0.16 s, then types the line. `camX, camY`: screen = world - cam. Returns `{x, y, w, h, side, alpha, chars, total, complete, clearHud, clearSpeakers, portraitRect, id, seed}` or `null` |
| `town.marker(f, camX, camY)` / `town.panelState()` | the marker's screen rect / `{id, seed, name, t, alpha, chars, total, complete}` from the talk clock (no view needed) |
| `town.folk` / `town.state()` / `town.rects(camX, camY)` / `town.stats()` | people (`{id, x, y, dir, moving, walk, spec, npc}`), text state, screen boxes, counters |

## One person

| call | what |
|---|---|
| `NG.make(seed, over)` | a spec (plain data, save it): `age`, `build`, `skin`, `hair`, `hairColor`, `top`, `bottom`, `shoes`, `head`, `face`, `extra`, colours, `name`, `title`, `line`. `over` forces parts (`{role: 'baker', age: 'elder'}`); unknown values are ignored |
| `NG.crowd(n, seed, {minDist, ages})` | `n` specs, no two look-alikes (feature distance and pixel distance), unique names, no trade more than twice |
| `NG.create(seedOrSpec, {params: {stride, shadow}})` | a person: `draw(ctx, feetX, feetY, {dir, moving, walk, frame, scale, alpha, shadow})`, `rect(x, y, o)`, `headTop(x, y, o)`, `info()`, `check()`, `lastDrawn()`, `stats()` |
| `dir` | `'down' 'up' 'left' 'right'`, `1` / `-1`, an angle in radians, or a vector `{x, y}` |
| walking | `moving: true` + `walk` = distance walked in px (frame = `floor(walk / stride) % 4`, stride 4), or `frame: 0..3` |
| `NG.portrait(spec)` | the head-and-shoulders crop of the front frame the panel shows (22 x 22 art px, `c` = colours, `key`) |
| `NG.panel(ctx, specOrInfo, {view, avoid, speakers, scale, t})` / `NG.panelLayout(info, o)` | the panel on its own (`t` = ms since the talk began) / its placement without drawing |
| `NG.verify(spec)` / `NG.raster(spec, dir, frame)` / `NG.lookalike(a, b)` | frame checks, one frame as pixels (no DOM), pixel look distance (under `NG.LOOKALIKE` = look-alike) |
| `NG.text(ctx, s, x, y, col, shadow)`, `NG.textWidth(s)` | the 5 x 7 pixel font |

## Generic integration (15 lines)

```js
let town = null;
function newGame() { /* ... */ town = GameDNA_NpcGen.town({ seed: 7, count: 6, area: VILLAGE, blocked: (x, y) => solidAt(x, y), scale: 1 }); }
function fixedStep(dt) { /* ... the world ... */ town.update(dt, { x: hero.x, y: hero.feetY }); }
function onTalkKey() {
  if (gameTalkTarget()) return gameTalk();                      // the game's own targets first
  if (town.talking()) return town.release();
  const f = town.nearest(hero.x, hero.feetY, 24); if (f) town.talk(f, { x: hero.x, y: hero.feetY });
}
function drawWorld(cam) {
  const list = gameSprites();
  for (const d of town.drawables(cam.x, cam.y)) list.push({ y: d.y, draw: () => d.draw(ctx) });
  list.sort((a, b) => a.y - b.y).forEach(s => s.draw());
}
function drawScreen(cam) { drawWorld(cam); town.panel(ctx, cam.x, cam.y - HUD_TOP, { view: { x: 0, y: 0, w: VIEW_W, h: VIEW_H }, avoid: HUD_BOXES }); drawHud(); drawMenus(); }
```

## Self-check without a browser

- Work one example through: a person at world (200, 150), camera (64, 40): `draw(ctx, 136, 110)`; the row under its shoes is
  y 110 on the canvas, the same row as the hero's feet when it stands at the same y. If the map is drawn 16 px lower (a HUD
  bar above it), `town.panel` gets `camY = 40 - 16 = 24`.
- `town.update` is called once per fixed step in the same place the world updates (so `?t=` replays match live play), and
  not while a menu, dialogue or battle screen has paused the world. The panel's slide-in and typewriter move only with it.
- `blocked(x, y)` answers for one world point (walls, water, houses, props) and never throws.
- Nobody else moves the townsfolk; the game never mirrors them with `scale(-1, 1)`: pass `dir`.
- The game's own talk targets keep priority: only when nothing else answers the talk key, ask `town.nearest(...)`.
- `avoid` lists the HUD boxes drawn every frame (bars, labels, a boss bar while it shows).
- `?auto=1` and `?t=` still end as before: the town reads no input and changes no game state.
