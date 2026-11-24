# Add dissolve-out defeats to my game

Defaults (change any of these before pasting):
`{{variant}}` = dither · `{{duration}}` = 700 · `{{flash}}` = 100 · `{{edge}}` = white · `{{chunk}}` = 1 · `{{spill}}` = 3

---

You are given `dissolve-defeat.js`, a finished module, and its README (full API). **Include it verbatim** (`<script src>` before the game script, or pasted unchanged into its own `<script>`); never rewrite it. It defines `GameDNA_DissolveDefeat`.

Goal: when a unit is defeated and leaves the field, its sprite dissolves (variant `{{variant}}`, white blink `{{flash}}` ms, then `{{duration}}` ms) instead of vanishing or fading. The game removes the unit **at once**; the module plays the effect from a snapshot. Only wire it in: add code, never remove, rename or replace existing functions.

**First read the game** and note: every place HP reaches 0, how each sprite is drawn (image, x/y, mirroring, hover/bob), the fixed update step, the draw pass, where a battle starts, and every caller of those (`?auto=1`, `?t=&freeze=1`, keys, restart). All must keep working.

**Integration points**

1. **Create one instance** after the screen size exists:
   `dd = GameDNA_DissolveDefeat.create({view: {x: 0, y: 0, w: <field width>, h: <field height above the HUD>}, params: {variant: '{{variant}}', duration: {{duration}}, flash: {{flash}}, edge: '{{edge}}', chunk: {{chunk}}, spill: {{spill}}}, uiRects: () => [<banner/window rects on screen now>]})`.
2. **Defeat**: in the function that lowers HP, remember `wasAlive` first; right after the change, if `wasAlive && hp === 0` and the unit leaves the field, call
   `dd.defeat(unit.id, {rect: {x, y, w, h}, image: <the sprite canvas/image drawn now>, flipX: <true if drawn mirrored>})`.
   The rect is where that image is drawn this frame (same rounding, hover, bob; ignore hit shakes and lunges). A sprite drawn by code instead of one image: pass `drawSprite: ctx => <draw it on this ctx at its screen position>`, using the `ctx` argument, never your screen context. Units that stay down on the field (revivable heroes) keep their own look.
3. **Remove at once**: the unit's draw code skips dissolved units from the defeat frame on; turn off their built-in death fade, but keep its counters if other code reads them.
4. **Advance**: every fixed step (also during banners, menus, end screen): `dd.update(<step ms>)`; `0` while frozen.
5. **Draw**: in the draw pass after all units, before effects, banners and HUD: `dd.draw(ctx)` (inside any shake translate).
6. **Reset**: where a battle or level starts or restarts: `dd.clear()`. If that code also runs before step 1, create `dd` earlier in the file (a `typeof` guard does not protect a `const` declared later).

Do **not** make victory, wave-clear or turn order wait for the effect: the end of battle must happen on the same frame as before. (Optional: code that keeps calling `update` may `await` the promise `defeat` returns, or check `dd.busy()`.)

**Self-check without a browser**
- The module is byte-identical; `defeat` runs once per defeat.
- Each lethal HP write reaches `dd.defeat`; trace one kill: HP 0 → `defeat` with the drawn rect → unit not drawn → `update` each step → `draw` each frame.
- Every identifier in the snippets exists when it runs; `dd` exists before the first defeat or `clear()` (or is guarded).
- Every existing function and caller is still there; the end-of-battle condition is unchanged.

**Acceptance checks** (screenshots if you can)
1. A defeated enemy blinks white, then dissolves at its exact spot in about {{duration}} ms; its old sprite and old fade never show alongside.
2. Nothing is drawn on neighbours, outside the field or over the HUD; the effect follows no unit.
3. `?auto=1` runs to the same ending as before with no console errors; `?t=<ms>&freeze=1` shows a half-dissolved enemy, identical on reload; restarting shows no leftovers.
