# Add modern damage numbers to my game

Defaults (change any before pasting):
`{{size}}` = 0 (auto) · `{{duration}}` = 1100 · `{{arc}}` = 1 · `{{punch}}` = 0.6 · `{{merge}}` = 600 · `{{palette}}` = vivid · `{{icons}}` = on · `{{hitstop}}` = 50 · `{{crit}}` = burst · `{{render}}` = auto · `{{stack}}` = on

---

You are given `damage-pop.js` (a finished module, one global `GameDNA_DamagePop`) and its `README.md`. **Include the module verbatim** (`<script src>` before my game script, or pasted unchanged into its own `<script>`); never edit it. It draws modern damage numbers (arcs, crit pops, rolling totals, type icons, placement that avoids units and UI).

If my game already shows damage numbers, route them through this module so each hit shows one number. Add code; never delete or rename my functions.

**Integration points** (find these places in my game):

1. **Create one instance** once my units and the play-field size exist, before the first hit:
`dp = GameDNA_DamagePop.create({ bounds, params: { size: {{size}}, duration: {{duration}}, arc: {{arc}}, punch: {{punch}}, merge: {{merge}}, palette: '{{palette}}', icons: '{{icons}}', hitstop: {{hitstop}}, crit: '{{crit}}', render: '{{render}}', stack: '{{stack}}' }, getAnchor, getObstacles, onHitStop, onShake, onFlash })`
   - `bounds`: the play field above the HUD, logical canvas pixels.
   - `getAnchor(id)` → `{x, top, w, h}`: sprite centre x, top of what is drawn above it (hover, HP bar), size. Keep answering for dead units; a unit dashing to attack returns its home spot.
   - `getObstacles()` → each living unit's sprite rect with its `id` (also at its home spot if it moves), HP bars with the unit's `id`, every HUD window, banner and message box **without** `id`.
   - In a scrolling game, use screen pixels (world minus camera) everywhere.
   - `onHitStop(ms)`, `onShake`, `onFlash`: call my freeze/shake/flash if I have them, else do nothing.
2. **Spawn** after every HP, MP or status change (attacks, spells, items, ticks), once per change (none for a 0 heal; `miss` only for an attack aimed at a unit): `dp.spawn(target.id, realChange, kind, { type, crit })`, `realChange` = the change after clamping. Kinds: `damage`, `crit`, `heal`, `shield`, `mp`, `miss`, `block`, `dodge`, `status` (amount = the word). Types: `physical`, `fire`, `ice`, `shock`, `poison`, `arcane`, `heal`, `shield`, `mana` (map mine to the nearest).
3. **Update** in my fixed step: `dp.update(stepMs)`; `dp.update(0)` while my world is frozen or paused.
4. **Draw** once per frame after sprites and hit effects, before banners and HUD: `dp.draw(ctx)` (inside a camera translate: `dp.draw(ctx, camX, camY)`). Never clip, proxy or filter its drawing: it already avoids every rect you report.
5. **Clear** where a battle, wave or level starts: `dp.clear()`. HP changes made while a banner covers the field (wave refills): spawn them when the banner ends.

**Keep every other caller working**: autoplay (`?auto=1` must finish), `?t=&freeze=1` (numbers advance only through `update`), restart, pause, shortcuts.

**Self-check without a browser**
- The module file is byte-identical to the one given.
- List every HP/MP write and the `spawn` after it; no hit spawns twice.
- `dp` and everything `getAnchor`/`getObstacles` read exist at the first hit; `getAnchor` answers for dead units.
- Walk one hit: HP change → `dp.spawn` → `update` → `draw`.

**Acceptance checks** (screenshots if you can)
1. A hit shows its number on the hit frame, arcing up and landing above the target, then fading.
2. Quick hits on one target roll into one total; a crit is bigger with a burst; heals are green `+n`; misses read `MISS`.
3. No number touches another unit, its HP bar, a window, a banner or another number.
4. `?auto=1` plays to the end with no console errors.
