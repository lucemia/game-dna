Defaults: `{{speed}}` = 72, `{{turn}}` = 100, `{{bank}}` = 5, `{{height}}` = 56, `{{transition}}` = 600, `{{sky}}` = day (day / dusk), `{{mount}}` = bird (bird / glider), `{{minimap}}` = on

---

Add a **flight mode** to my top-down game: the hero calls a {{mount}} mount, the map tilts into a pseudo-3D ground with a horizon, and the player flies and lands on flat ground, back in the walking view. Use the module file `pseudo3d-flight.js` given with this prompt (global `GameDNA_Flight`, API in its README). It owns rendering, flight controls, transitions, mini-map and landing prompt; you only connect it.

**Rules.** Include the module verbatim in its own `<script>` before the game script; never edit it. Never delete or rename my functions; hook into them. Keep every existing control, the autopilot (`?auto=1` must end exactly as before: it never flies), `?t=<ms>&freeze=1`, restart, touch and mouse.

**Integration points (find them by role):**

1. **After the map and tile art exist:** `fl = GameDNA_Flight.create({...})` with
   - `cols, rows, tile`; `view` = the map's rectangle in the canvas (below any HUD band);
   - `tileAt(tx, ty)` = my tile id; `tileImage(id, tx, ty)` = the tile canvas my map draws;
   - `canLand(tx, ty)` = inside the map, walkable, flat, with no NPC, chest, enemy or door;
   - `topdown()` = my walking camera `{x, y}` (world px at the view's top-left);
   - `wrap: true` only if my world wraps; a bounded map uses `wrap: false, outsideTile: <border tile id>`;
   - `billboards`: one `{x, y, kind}` per tree, rock and house (one per object) (world px of its foot; kinds `tree pine rock town tower mountain`);
   - `markers()`: the current goal;
   - `params: {speed: {{speed}}, turn: {{turn}}, bank: {{bank}}, height: {{height}}, transition: {{transition}}, sky: '{{sky}}', mount: '{{mount}}', minimap: '{{minimap}}'}`;
   - `onLand: L => {...}`: put the hero's centre at `L.x, L.y`, clear any walk target, and **recompute my camera exactly as my walking code does** (the landing reads `topdown()`).
2. **Fixed update step:** `fl.update()` every step. While `fl.busy()`, skip walking, enemy movement, touch checks, interactions and click-to-walk (return early from the map update only; dialogs, battles and scenes stay intact).
3. **Take-off:** a key my game does not use (check every binding; e.g. `F`), only on the walking map with no dialog: `fl.takeOff({x: heroCentreX, y: heroCentreY, facing: 'up'|'down'|'left'|'right'})`. Show `F: FLY` in my hint line.
4. **Input:** first in keydown `if (fl.key(e.code, true)) { e.preventDefault(); return; }`; keyup `fl.key(e.code, false)`. True only while flying. If my game polls keys into its own sets, release them at take-off.
5. **Draw:** where the map is drawn, `if (!fl.draw(ctx)) <my map drawing>`; HUD stays on top. New game or restart calls `fl.reset()`.

**Self-check without a browser** (report each):
1. Every identifier in the options exists where used; `node --check` each script.
2. Callers of changed functions still work (autopilot, freeze, restart).
3. Trace `?auto=1`: the autopilot never presses the take-off key; with `busy()` false the map update runs as before, so the end state is identical.
4. Trace a flight: take-off -> `busy()` -> map update skipped -> `fl.land()` over grass -> `onLand` moves hero and camera -> walking resumes. Over water `canLand` is false.
5. Worked example: view 256x208, height 56, horizon 0.3 -> horizon row 62, mount ground row 154; a screen pixel there covers 56/(154-62) = 0.61 world px.

**Acceptance** (screenshots if you can):
- F on grass: in {{transition}} ms the map rotates, zooms and tilts to a horizon; the mount flies with its shadow; trees and houses stand up as billboards.
- Left/right turn and bank, up/down change speed.
- Z over water or trees: "NO LANDING"; over grass the landing ends exactly on the walking view, hero on that tile.
- `?auto=1` ends as before; no console errors; no horizontal scroll at 500 px.
