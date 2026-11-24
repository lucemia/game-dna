# G-04 starter: Thistledown Acre (farming plots)

A complete farm year on `GameDNA_FarmingPlots` (`../module/README.md`). Spring, Summer and Fall, four days each: till the
fenced field, buy seeds at the stall, plant, water, harvest, put produce in the shipping bin (paid each night), and earn a
ribbon at the Harvest Fair after Fall 4. Crops grow one day per watered night; a crop whose season ends withers; rain
waters everything. The farm is the repo's pixel-kit scenery (`art/pixel-scene.js`, unchanged), repainted per season by an
exact palette swap; the farmer, crops, soil, tools, HUD and night are the module's own code-drawn pixel art.

## Run

Open `index.html` (needs `art/` beside it; works from `file://` and http).

- `?auto=1` the bot farms the year (seed 7: the Harvest Fair card from about 237 s; back to the title 10 s later); P toggles it.
- `?t=<ms>&freeze=1` fast-forwards to that moment under autoplay and draws one frame (`window.__frozen` turns true).
- `?seed=` (default 7: the weather and every random detail), `?dayMs=`, `?seasonDays=`, `?seasons=`, `?rain=`, `?startGold=`.
- Keys: arrows / WASD walk (a tap turns to face, a second tap or holding steps), Z / Space / Enter use the tool on the faced
  tile (or ship at the bin, buy at the stall, sleep at the door), 1-9 or Tab / C pick a tool, Q next seed, X back, P autoplay.
  Pointer: tap a tile to walk there, or to walk next to a field tile / the bin / the stall / the door and use it; tap a
  hotbar slot; tap a shop row to buy; tap outside the shop to leave; tap the night card to continue.
- The world is drawn at native pixel size (about 320 px wide on desktops, 195 on phones) and scaled by a whole number; the
  HUD is drawn at CSS size, so its text stays at 11-17 px on a 390 px phone.
- `window.__state()` = `{t, scene, farm: <module state>, cam, actors: [{id, x, y, facing, target, vx, noFace}]}`.

## Structure

`index.html` = the page, `art/pixel-scene.js` (pixel-kit), the module (inlined verbatim), the game script (sections `=== 1.`
to `=== 9.`: config and the farm map, the game object, the season repaint, the instance and the event site, scenes, the main
tick, drawing, input, boot) and the **ADDONS SLOT** `<script>` at the end. Scenes: `title` -> `farm` (the year; the module's
phases `wake`, `play`, `shop`, `sleep`, `night`, `end`) -> `title`. The fair is the farm scene in phase `end`.

## Extension points

**Where addons and content go: the ADDONS SLOT.** Paste each addon's module and its `GAME.addons.push(...)`, and every
`GAME.addCrop / addTool`, into the marked `<script>` block (or put `<script src>` tags right above it). The slot runs after
`window.GAME` exists and **before the game boots**, so addons and content are there for the first day and every
`?t=&freeze=1` fast-forwarded frame.

```js
GAME.addons.push({
  name: 'my-addon',
  onEvent(ev, game) {},            // every rules event (see 1), read-only
  onHarvest(ev, game) {}, onPlant(ev, game) {}, onWater(ev, game) {}, onTill(ev, game) {}, onUse(ev, game) {},
  onShip(ev, game) {}, onBuy(ev, game) {}, onSell(ev, game) {}, onDay(ev, game) {}, onSeason(ev, game) {},
  onWither(ev, game) {}, onGrow(ev, game) {}, onRipe(ev, game) {},
  onKey(key, game) { return false; },   // key = 'up' | 'down' | 'left' | 'right' | 'ok' | 'back' | 'tool' | 'seed' | 'auto' | '1'..'9' | {tap, x, y} | {hold, on}; true consumes it
  update(game, info) {},           // every 60 Hz frame, every scene, also while frozen; info = {dt, frozen}
  draw(g, layer, game) {},         // layer 'world' (world px, after crops, farmer and effects, before dusk and rain) | 'hud' (CSS px, after the module's HUD) | 'overlay' (CSS px, last)
  drawUI(g, game) {},              // top UI hook (CSS px), after 'hud'
  onScene(scene, game) {}, onNewGame(game) {}, onEnd(result, game) {}
});
```

1. **Event site.** Every rules event of the module passes `eventSite` (section 4): the starter's built-in notices first,
   then `onEvent` and the named hook. Events: `till`, `plant`, `water`, `harvest {cell, crop, n}`, `clear` (a withered plant
   cut), `use {tool, action, dir, at, target, cells}`, `thunk` (a use that changed nothing), `step`, `turn`, `bump`, `tool`,
   `seed`, `ship {n}`, `buy {crop, n, gold}`, `poor`, `noSeed`, `shopOpen`, `shopClose`, `sleep`, `sell {gold, lines}`, `day
   {season, rain, newSeason}`, `season {season, withered}`, `grow`, `ripe`, `wither`, `end {earned, gold}`. Every event has
   `day` and `t` (the module clock). **Read-only**: change the farm only through keys and the content tables.
2. **Built-in notices.** One-line notices above the hotbar (harvests, shipping, "not enough gold", "no seeds").
   `GAME.flags.builtinToasts = false` turns them off (do this when you add a toast addon); `GAME.toast(text, {crop, icon,
   warn, key})` shows one.
3. **UI rects: `GAME.uiRects()`** `[{name, x, y, w, h}]` in **CSS px**, valid every frame and under `?t=` fast-forward (no
   draw needed): `clock` (the date, time and gold panel, top right), `hotbar`, `label` (the tool / prompt pill above it),
   `shop` (while open), `banner` (a new season), `card` (the night summary and the fair), `notice` (built-in notices),
   `title`. `GAME.unitRects()` = the farmer (while awake) and the merchant, CSS px. Keep clear of both.
4. **Positions.** `GAME.anchor('farmer' | 'merchant' | [cx, cy])` -> `{x, footY, top, left, w, h, world}` in CSS px (world
   = world px); `GAME.cellRect(cx, cy)` (a tile in CSS px), `GAME.worldToScreen(x, y)`, `GAME.view()` = `{w, h, cam: {x, y,
   scale}}` (CSS size of the canvas; the camera in world px; world px x scale = CSS px). Tiles are 16 world px.
5. **Input chain.** Keys and taps are queued; each tick every key goes to the addons' `onKey` in order; the first that
   returns `true` consumes it. Otherwise `auto` toggles autoplay, any other key during autoplay hands control to the player,
   then the scene handles it (farm: `GAME.C.key` / `GAME.C.setHeld` / a tap). `GAME.held` is maintained by keydown / keyup.
6. **Autoplay.** `GAME.autoplay.on` (`?auto=1`, P). The module's bot farms through the player's own key path: it harvests,
   ships, buys the season's seeds (every kind at least once, then the best earner it can afford), tills, plants, waters with
   the tool that covers the most dry plots, and sleeps. Addons must not consume arrows, `ok` or digits during autoplay.
7. **World clock.** `GAME.clock = {frame, paused}`; `GAME.pause(true)` stops the farm (the day clock, growth, the bot);
   `update(game, info)` still runs (`info.dt` 0). The farm day runs 6:00 to midnight in `params.dayMs` (28 s); at midnight
   the farmer goes to bed by himself.
8. **Content** (formats in `../module/README.md`), in the ADDONS SLOT:
   - `GAME.addCrop(id, def)`: a crop for the stall in its seasons. `def = {name, seasons: ['summer', ...], days (watered
     nights to ripe), stages (drawn stages, >= 3), seed (price), sell, regrow (0 or days back to ripe), yield, look: {kind:
     'root' | 'leafy' | 'vine' | 'stalk' | 'gourd' | 'flower', leaf: [4 colours dark..light], fruit: [4 colours dark..light]}}`
     (or `draw(ctx, x, y, stage, info)` to paint it yourself). With 4-day seasons a crop must ripen in <= 3 days to be bought.
   - `GAME.addTool(id, def)`: a tool on the next hotbar slot (key 5, 6, ...). `def = {name, action: 'till' | 'water' |
     'plant' | 'harvest', area: [[forward, side], ...] (cells from the farmer: [1, 0] = the faced tile, [1, -1] / [1, 1] its
     left / right neighbours, [2, 0] the one beyond), ms, icon: 'hoe' | 'can' | 'seeds' | 'sickle' | a function (ctx, x, y,
     size), colors: [metal, wood or body, highlight]}`. The bot uses it when it covers more useful tiles.
   - The tables are readable as `GAME.crops`, `GAME.tools`, `GAME.toolOrder`, `GAME.params`, `GAME.farm` (the map).
     `GAME.shipped` lists the crop and tool ids this file ships with.

`GAME.C` (the module instance), `GAME.scene`, `GAME.results`, `GAME.lastEnd` and `GAME.state()` are readable.

## Adding toasts (e.g. C-14 toasts)

```js
GAME.flags.builtinToasts = false;                                   // the toast addon replaces the built-in notices
const toasts = GameDNA_Toasts.create({ bounds: () => ({ x: 0, y: 0, w: GAME.view().w, h: GAME.view().h }),
  uiRects: () => GAME.uiRects().concat(GAME.unitRects()), params: { edge: 'top-left', max: 3 } });
GAME.addons.push({ name: 'toasts',
  onHarvest(ev) { const d = GAME.crops[ev.crop]; toasts.push('item', d ? d.name : ev.crop, { icon: 'leaf', count: ev.n }); },
  onShip(ev) { if (ev.n) toasts.push('info', 'Shipped ' + ev.n + ' crops', { text: 'Paid tonight', icon: 'coin' }); },
  onBuy(ev) { const d = GAME.crops[ev.crop]; toasts.push('item', (d ? d.name : ev.crop) + ' seeds', { icon: 'pouch', count: ev.n }); },
  onSeason(ev) { if (ev.withered) toasts.push('warning', ev.withered + ' crops withered', { text: 'Out of season' }); },
  onEvent(ev) { if (ev.kind === 'poor') toasts.push('warning', 'Not enough gold', { key: 'poor' }); },
  update(game, info) { toasts.update(info.dt); }, draw(g, layer) { if (layer === 'overlay') toasts.draw(g); },
  onNewGame() { toasts.clear(true); } });
```

## Adding a crop and a tool

```js
GAME.addCrop('sunflower', { name: 'Sunflower', seasons: ['summer', 'fall'], days: 3, stages: 5, seed: 28, sell: 80,
  look: { kind: 'flower', leaf: ['#1e4a24', '#3a7a34', '#64a844', '#9ad06a'], fruit: ['#a8600c', '#f0a818', '#ffd84a', '#fff4b0'] } });
GAME.addTool('sprinkler', { name: 'Sprinkler Can', action: 'water', area: [[1, -1], [1, 0], [1, 1]], ms: 420, icon: 'can',
  colors: ['#3a4a8a', '#6a7ac8', '#c0c8f0'] });
```

Rendered (author trial `checks/starter+task/`): the sunflower grows from a mound to a green stalk with a bud, ripe with a
golden ring of petals around a brown disc (fruit ramp hues about 40-48 degrees); the sprinkler can is drawn indigo in slot 5
and waters the faced plot and both side plots at once.
