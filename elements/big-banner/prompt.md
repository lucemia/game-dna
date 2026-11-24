# Add big banner text to my game

Defaults (change any of these before pasting):
`{{enter}}` = slide · `{{exit}}` = wipe · `{{enterMs}}` = 260 · `{{holdMs}}` = 900 · `{{exitMs}}` = 260 · `{{size}}` = 2 · `{{band}}` = 0.72 · `{{position}}` = center · `{{block}}` = on · `{{queue}}` = queue

---

You are given `big-banner.js`, a finished module, and its `README.md`. **Include the module verbatim** (`<script src>` before the game script, or pasted unchanged into its own `<script>`). Never rewrite or "fix" it. It defines one global, `GameDNA_BigBanner`. It draws big phase/result banners over a translucent band, queued so two never overlap.

Only wire it in. Add code; never remove or rename existing functions.

**First, read my game** and note: the fixed step and every loop calling it (animation, `?t=&freeze=1` fast-forward, autoplay); the draw pass; HUD/menu/caption rects; every place a phase, wave, stage, victory or defeat starts; the restart path; the game's current text for those moments.

**Integration points**

1. **Load** the module before the game script.
2. **Create one instance** once the screen size is known (if the game already uses the name `banner`, pick another):
```js
const banner = GameDNA_BigBanner.create({
  bounds: { x: 0, y: 0, w: <screen width>, h: <top of the HUD> },
  getObstacles: () => [ /* HUD, menu, caption rects {x, y, w, h}, no id */ ],
  params: { enter: '{{enter}}', exit: '{{exit}}', enterMs: {{enterMs}}, holdMs: {{holdMs}}, exitMs: {{exitMs}}, size: {{size}}, band: {{band}}, position: '{{position}}', block: '{{block}}', queue: '{{queue}}' }
});
```
3. **Show**, once, in update logic where the state changes (never in draw code): player phase `show('PLAYER PHASE', {kind: 'phase', sub: 'TURN ' + n})`, enemy phase `kind: 'enemy'`, wave/round `kind: 'info'`, stage clear `kind: 'clear'`, danger `kind: 'warn'`. Prefer the game's own words ("YOUR PHASE", its result lines). Results that wait for a key are sticky: `show('VICTORY', {kind: 'clear', hold: 0, sub: <the game's existing "press" hint>})`, `show('DEFEAT', {kind: 'defeat', hold: 0, sub: ...})`.
4. **Advance**: `banner.update(<step ms>)` inside the fixed step itself, so every loop that calls the step (including the freeze fast-forward) advances it.
5. **Draw**: `banner.draw(ctx)` as the last call of the draw pass, after the HUD, outside any shake translate.
6. **Reset**: `banner.clear()` at the start of new game/restart, before that game's first `show()`. When the player presses continue on a sticky banner, the game's existing handler runs; add `banner.dismiss()` there if the game stays on the same screen.
7. **Turn off the old text** for these moments: delete the call in the draw pass, keep the helper function.

Waiting is optional: `banner.busy()` is true while a blocking banner is up (not during a sticky hold). Keep the game's phase lengths, autoplay timing and keys. If you gate on `busy()`, do it in one place that player input and autoplay both pass through, and never gate the restart/continue key.

**Self-check without a browser**
- Module byte-identical, loaded before the game script.
- Grep `show(`: every call is in update logic at a state change, none in a draw function; a phase that can start twice in a row still shows once each time.
- Grep `update(`: inside the fixed step; the freeze/fast-forward loop calls that same step.
- `getObstacles` identifiers exist when first called; no host function removed or renamed.
- Walk a turn change (`show` → `update` steps → gone after {{enterMs}} + {{holdMs}} + {{exitMs}} ms) and a restart (`clear()` → first banner).

**Acceptance checks** (screenshots if you can)
1. Each phase/wave start shows one big banner across the field, clear of the HUD: in, hold, out.
2. Two moments at once play one after the other, never on top of each other.
3. Victory/defeat banners stay until the player continues; continue/restart still works with the same keys.
4. `?t=<ms>&freeze=1` gives the same banner frame every time; `?auto=1` ends with no console errors and the same result as before.
