# Add palette-swap variants to my game

**Required:** `{{uses}}` = which sprites get which looks, in your words.
Defaults:
`{{hueTol}}` = 24 · `{{protectSkin}}` = auto · `{{target}}` = primary · `{{strength}}` = 0.6 · `{{pulseHz}}` = 2 · `{{pulseSteps}}` = 4 · `{{spentDim}}` = 0.6 · `{{keepOutline}}` = on · `{{elite}}` = violet · `{{eliteEdge}}` = on

---

You are given `palette-swap.js`, a finished module, and its `README.md`. **Include the module verbatim** (`<script src>` before the game script); never rewrite it. It defines `GameDNA_PaletteSwap`: it detects a sprite's colour ramps and builds cached variants (`team-blue`, `team-red`, `team-green`, `team-yellow`, `elite`, `rare`, `poison`, `petrify`, `frozen`, `lowhp`, `spent`, joined with `+`, e.g. `team-red+spent`).

**Use the variants exactly for: {{uses}}. Do not recolour anything else.**

Do not change the game's art, rules, timers or RNG; never remove or rename functions.

**First, read my game** and note: where each sprite is baked (a long-lived canvas or image); every pass that draws it (normal, hit-flash overlay, death fade, mirrored, menus); which existing state says side, acted, HP, status, and where each side's phase begins and ends; the fixed step and its callers (animation loop, `?t=&freeze=1`, autoplay).

**Integration points**

1. **Load** the module before the game script.
2. **Create one instance** after the sprites are baked:
```js
const PS = GameDNA_PaletteSwap.create({ params: { hueTol: {{hueTol}}, protectSkin: '{{protectSkin}}', target: '{{target}}', strength: {{strength}}, pulseHz: {{pulseHz}}, pulseSteps: {{pulseSteps}}, spentDim: {{spentDim}}, keepOutline: '{{keepOutline}}', elite: '{{elite}}', eliteEdge: '{{eliteEdge}}' } });
```
3. **One name function** deriving the name from existing state, e.g. `function looks(u) { let n = u.side === 'player' ? 'team-blue' : 'team-red'; if (u.acted && <u's side is acting now>) n += '+spent'; return n; }`. **`spent` means "acted during the current phase of its own side"**: reuse the game's own done/acted flag and its own guard (e.g. "only during the player phase"). If you must add a flag, clear it for a side when that side's phase ENDS, where the game resets its own per-turn flags, never later. Other missing looks (elite, a status) get a visual flag no rule reads, set where the state begins, cleared where it ends.
4. **At every pass that draws those sprites**, change only the image argument: `drawImage(PS.variant(sprite, looks(u)), ...)`, the same variant in the normal pass and in any overlay pass that redraws the sprite (additive hit flash). Keep transforms, flips, alpha. Stop drawing the game's own pre-baked art for a look you replaced (e.g. its grey "acted" sprite); keep pure white flash frames.
5. **Let detection pick the ramps.** Do not call `setRamps` unless a sprite visibly fails.
6. **Advance** `PS.update(<step ms>)` once per fixed step.

Never pass a canvas created inside the draw function. If a sprite canvas is redrawn in place, call `PS.invalidate(sprite)` after.

**Self-check without a browser**
- Module byte-identical.
- `variant(` only in draw code, as the image argument; grep every `drawImage` of those sprites: none missed.
- Every name is from the list; flags you added are read only by `looks()`.
- Walk a turn: during the player phase no enemy is `spent`; during the enemy phase no player unit is; the turn after, nobody starts spent.
- `update(` once per fixed step; the freeze loop calls that step.
- No rule, timer or RNG call changed.

**Acceptance checks**
1. {{uses}}: each look on the right sprites, whole garments recoloured; faces and outlines unchanged.
2. A look starts on the frame its state starts and ends when it ends (a side's `spent` ends with its phase).
3. `?t=<ms>&freeze=1` is deterministic; `?auto=1` ends as before, no console errors or warnings.
