# Add a modern particle system to my game

Defaults (change any before pasting):
`{{budget}}` = 2000 · `{{density}}` = 1 · `{{scale}}` = 0 (auto) · `{{render}}` = auto · `{{glow}}` = auto · `{{gravity}}` = 1 · `{{wind}}` = 0 · `{{bounce}}` = 1

---

You are given `modern-particles.js` (a finished module, one global `GameDNA_Particles`) and its `README.md`. **Include the module verbatim** (`<script src>` before my game script, or pasted unchanged into its own `<script>`); never edit it. A pooled, seeded particle engine with presets (`burst`, `sparks`, `fountain`, `smoke`, `swirl`, `dust`, `pickup`, `embers`, `aura`). It only draws; it never reads input or changes game state.

Add code; never delete or rename my functions.

**Integration points** (find these places in my game):

1. **Create one instance** at load, after the canvas exists:
`fx = GameDNA_Particles.create({ seed: 1, view: {x: 0, y: 0, w: <logical width>, h: <logical height>}, params: { budget: {{budget}}, density: {{density}}, scale: {{scale}}, render: '{{render}}', glow: '{{glow}}', gravity: {{gravity}}, wind: {{wind}}, bounce: {{bounce}} }, ground, uiRects })`
   - `view`: my game's own coordinates, not the devicePixelRatio backing size.
   - `ground(x, y)`: world coordinates; top y of the first solid surface at or below (x, y), or `null` over a pit. Build it from my existing collision test, unchanged; omit it without a floor.
   - `uiRects()`: screen rects of my HUD, message boxes and end panels; particles are clipped out of them.
2. **Emit on events**, in the update step where my game decides the event, once per event, in world coordinates (as my sprites):
   - hit accepted (after cooldown / invulnerability checks): `fx.emit('sparks', contactX, contactY, { facing: attacker left of target ? 1 : -1, amount: 0.6 })`
   - enemy defeated: `fx.emit('burst', centreX, centreY)` (sprite is an image or canvas: add `shape: {type: 'outline', image, w, h}`)
   - pickup: `fx.emit('pickup', x, y)`; landing and jump: `fx.emit('dust', feetX, feetY, { floor: feetY })`
   - player hurt: `fx.emit('burst', x, y, { color: 'blood', amount: 0.4 })`; checkpoint, heal, respawn: `fx.start('swirl', x, y, { duration: 1200 })`
   - ambient sources my level already draws (torches, lava, portals, chimneys): `fx.start('embers' | 'smoke' | 'fountain' | 'swirl', x, y)` **once**, when it starts or appears.
   Use at least four that match my game. Never emit in draw code.
3. **Update** in my fixed step, in every scene, including any `?t=` fast-forward loop: `fx.update(stepMs)`; skip it or pass 0 while paused.
4. **Draw** once per frame in screen space, after world sprites, before the HUD, outside any camera translate: `fx.draw(ctx, -cameraX, -cameraY)`, plus any constant offset my world drawing adds.
5. **Clear** where a run or level restarts, before its ambient emitters start again: `fx.clear()`.

**Keep every other caller working**: autoplay (`?auto=1` must end exactly as before), `?t=&freeze=1`, restart, pause, keyboard and touch. No `Math.random` or wall clock in anything you add.

**Self-check without a browser**
- The module is byte-identical to the one given and loads before my game script.
- List every event site and its one emit; none before the hit is accepted, none in draw code.
- `fx`, `ground` and `uiRects` exist before the first step; `ground` uses world coordinates, `uiRects` screen coordinates.

**Acceptance checks** (screenshots if you can)
1. A hit throws streak sparks that fall, bounce and skid; a defeat flashes with a ring, sparks and embers.
2. Pickups twinkle, landings kick dust.
3. No particle covers the HUD; particles stay with the world when the camera scrolls.
4. `?auto=1` ends as before with no console errors; `?t=4000&freeze=1` gives the same picture twice.
