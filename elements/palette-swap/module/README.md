# palette-swap.js (D-01 module, v1)

One plain script, no dependencies, no `import`/`export`. It defines one global, `GameDNA_PaletteSwap`. Paste it into a `<script>` tag or load it with `<script src>`, without changing it. It turns a sprite your game already has into recoloured variants (team colours, elite and rare foes, status tints, a low-HP pulse, a greyed "already acted" look) by finding the sprite's colour ramps and mapping them, dark to light, onto new ramps. Each (sprite, variant) is built once from the sprite's own pixels and cached, so a call per sprite per frame is a lookup. Your art does not change: you call `variant(sprite, name)` where you already draw the sprite.

## API

`GameDNA_PaletteSwap.create(options)` returns an instance.

| option | meaning |
|---|---|
| `params` | Any of `hueTol` 24, `protectSkin` 'auto', `target` 'primary', `strength` 0.6, `pulseHz` 2, `pulseSteps` 4, `spentDim` 0.6, `keepOutline` 'on', `elite` 'violet', `eliteEdge` 'on' (table below). |
| `skin` | Optional. A skin id or object for `GameDNA_Skin.resolve()` (`skins/skin-api.js`). The `team-a` / `team-b` / `team-n` ramps are built from the skin's `palette.team` colours, and `drawRamps()` draws its panel with `skin.frame` and `skin.text`. Without skin-api the module uses built-in pixel16 colours; `skin: false` forces that. |
| `onWarn(key, message)` | Optional. Every warning is also printed once with `console.warn`. |

| param | default | meaning |
|---|---|---|
| `hueTol` | 24 | Degrees of hue that still count as one ramp when colours are grouped (8–60). Raise it when one garment splits into two ramps; lower it when two garments merge. |
| `protectSkin` | auto | Skin-like colours (warm, mid-saturated, light: faces, hands, gold trim) are kept out of team swaps. `auto`: kept out unless they are the sprite's biggest colour group (a tan beast); `on` / `off`: always / never. |
| `target` | primary | Which detected ramps a team, elite or rare swap recolours: `primary` (the biggest coloured ramp, usually clothing or body), `primary+secondary`, or `all` coloured ramps. |
| `strength` | 0.6 | How far `poison` and `lowhp` pull colours to their tint (`frozen` uses +0.15; `petrify` is always full). |
| `pulseHz`, `pulseSteps` | 2, 4 | `lowhp` pulses at this rate in this many cached steps. |
| `spentDim` | 0.6 | Brightness of the greyed `spent` look. |
| `keepOutline` | on | Very dark colours (outline, eyes) stay as they are in every variant. |
| `elite`, `eliteEdge` | violet, on | Ramp for `elite` (`violet`, `crimson`, `gold`, `shadow`) and whether its outline is tinted too. When the sprite's own primary colour is within 45° of hue of that ramp (a violet mage), the farthest of violet / crimson / gold is used, so an elite always looks different. |

| method | |
|---|---|
| `variant(sprite, name, opts?) → canvas` | The variant to draw instead of `sprite`. Returns `sprite` itself for `'base'`, for an unknown name, for an image that has not loaded yet, or for a cross-origin image whose pixels cannot be read (each warns once). Never throws. `opts.level` (0..1) fixes the `lowhp` pulse instead of using the clock. |
| `draw(ctx, sprite, name, x, y, opts?)` | Convenience: `drawImage` of the variant at whole pixels. `opts = {flipX, alpha, w, h}`. |
| `update(dtMs)` | The clock of animated variants (`lowhp`). Call it once per fixed step so `?t=&freeze=1` frames are deterministic. |
| `fromRows({rows, pal})` | Bakes a palette-indexed string sprite to a canvas once (cached per object). `variant()` accepts the `{rows, pal}` object directly. |
| `ramps(sprite)` | The detected ramps: `[{role, colors: ['#hex' dark → light], pixels, hue}]`. Roles: `primary`, `secondary`, `accent1`…, `skin`, `neutral` (greys, steel, white), `outline`. Ramps rank by pixel count; mostly-brown ramps (leather, wood, hair) count half, so the clothing is `primary`. |
| `setRamps(sprite, {primary: [...], secondary: [...], skin: [...]})` | Explicit mapping for one sprite when detection guesses wrong: list each ramp's colours dark → light. Colours you do not list stay fixed. `setRamps(sprite, null)` returns to detection. |
| `define(name, spec)` | Adds a variant: `{ramp: [5 colours dark → light]}` (a ramp swap like a team), `{kind: 'tint', ramp, strength}` (whole sprite, like poison), `{map: {'#from': '#to'}}`, or `{fn: (rgb, {role, pos}) => rgb}`. |
| `invalidate(sprite?)` | Forget cached variants of a sprite whose pixels changed (or of all sprites). |
| `stats()` | `{calls, hits, builds, variants, sources, buildMs, fallbacks, rebuilds, hitRate}`. `variants` and `sources` count what is cached now; `builds` counts every build since `create`. |
| `setParams(obj)`, `params()`, `names()`, `ramp(id)`, `pulse()`, `time()`, `clear()` | `setParams` rebuilds variants with the new params on their next call. `clear()` drops the cache and resets the clock. |
| `drawRamps(ctx, sprite, x, y, {variant, w, h, swatch})` | A small inspector panel (for tools and demos): each detected ramp and what `variant` maps it to. |

**Variant names** (combine with `+`, e.g. `team-red+spent`, `elite+poison`; ramp swaps are applied before tints, whatever the order in the name):

| name | look |
|---|---|
| `base` | the sprite unchanged |
| `team-blue`, `team-red`, `team-green`, `team-yellow` | primary ramp → that team ramp (5 hand-picked steps), shading order kept |
| `team-a`, `team-b`, `team-n` | the same, from the skin's team colours |
| `elite` | primary ramp → `elite` ramp, outline tinted (`eliteEdge`) |
| `rare` | primary ramp → a pale cyan "shiny" ramp (pink when the sprite is already cyan-ish) |
| `poison`, `frozen`, `petrify` | whole sprite (outline kept) pulled toward a sickly green, an ice blue, or replaced by grey stone, by brightness |
| `lowhp` | red tint that pulses with the module clock (`pulseHz`, `pulseSteps`); step 0 is the sprite itself |
| `spent` | greyed and dimmed (`spentDim`), outline kept |
| `flash`, `shadow` | white or dark silhouette |

**String sprite format** (data the designer edits): `{rows: ['..oo..', '.oCCo.'], pal: {o: '#140e1c', C: '#84e0cc'}}`. One character per pixel, rows top to bottom; `.` or any character missing from `pal` is transparent. Keep one object per sprite (do not rebuild it every frame).

## Integration (15 lines)

```js
// <script src="palette-swap.js"></script> before your game script
const PS = GameDNA_PaletteSwap.create({ params: { strength: 0.6 } });   // once, after your sprites are baked
function variantFor(unit) {                       // derive the name from state the game already has
  let name = unit.side === 'player' ? 'team-blue' : 'team-red';
  if (unit.elite) name = 'elite';
  if (unit.status === 'poison') name += '+poison';
  if (unit.hp > 0 && unit.hp <= unit.maxHp / 4) name += '+lowhp';
  if (unit.acted && unit.side === activeSide) name += '+spent';   // only during its own side's phase
  return name;
}
function drawUnit(unit) {                         // your existing draw code: only the image changes
  const img = PS.variant(unit.sprite, variantFor(unit));   // was: const img = unit.sprite;
  ctx.drawImage(img, unit.x, unit.y);
}
function step(dt) { /* world */ PS.update(dt); }  // fixed step: drives the low-HP pulse
```

## Keep the game's other callers working

- **Every pass that draws the sprite** (map, battle, portraits, menus, death fade, mirrored enemies, and any overlay pass that redraws it, such as an additive hit flash) uses the same variant. Change only the image argument, and keep its transforms, flips, alpha and composite modes. Stop drawing the game's own pre-baked art for a look you replaced (its grey "acted" sprite); keep pure white flash frames and its grey "dead" frame.
- **`spent` means "acted during the current phase of its own side".** Reuse the game's own done/acted flag together with its own guard (e.g. it greys units only while `stage === 'player'`). If you add a flag, clear it for a side where that side's phase ENDS (where the game resets its own per-turn flags), never at the start of that side's next phase: otherwise enemies stay grey through the whole player phase.
- **Let detection pick the ramps.** Hand-listing only some colours with `setRamps` (e.g. a tunic) leaves the rest of the garment (a hood) in its old colour. Use `setRamps` only for a sprite that visibly fails, and list every colour of the garment.
- **The sprite object must be stable**: pass the same baked canvas or image every frame. A canvas created inside the draw function is a new cache key each frame (the module warns after 256 sources). If the game redraws a sprite canvas in place, call `invalidate(sprite)` after it does.
- **Rules and RNG**: variants are looks only. Derive the name from state the game already has; if it lacks a flag (e.g. "elite"), add a plain visual flag that no rule reads. Never call the game's RNG for it.
- **Autoplay and `?t=&freeze=1`**: `update(stepMs)` goes in the fixed step the animation loop, the fast-forward loop and autoplay all call, not in the `requestAnimationFrame` callback, so frozen frames are identical.
- **Restart**: nothing to do (the cache stays valid). Call `clear()` only if sprites were rebuilt.

## Self-check without a browser

1. The module file is byte-identical to the one you were given and loads before the game script.
2. `variant(` appears only in draw code, as the image argument; no draw site of that sprite was missed (grep every `drawImage` of it).
3. The first argument is a long-lived sprite object (grep: no `createElement('canvas')` on the way to it inside a draw function).
4. Walk a turn: during the player phase no enemy is `spent`, during the enemy phase no player unit is, and the next turn starts with nobody spent.
5. Every name is one from the table, or defined with `define()` before its first use; `+` joins names with no spaces needed.
6. `update(` runs once per fixed step; the freeze loop calls that step.
7. No game rule, timer or RNG call changed; `?auto=1` ends with the same result as before.
8. Walk one case: a red-side unit that has acted → `variant(sprite, 'team-red+spent')` → its clothing ramp becomes the red ramp, then everything but the outline turns grey at 60 % brightness.

## What it guarantees

- A variant keeps the sprite's size, transparency, and the dark → light order of every ramp (a shadow stays darker than its highlight).
- Each (sprite, variant, pulse step) is built once; later calls are a map lookup. Building a 16×20 sprite variant takes well under a millisecond.
- `variant()` never throws and never returns `null` for a drawable input: on any problem it returns the original sprite and warns once.
- The module reads no input, calls no host RNG, and draws nothing unless you call `draw()` or `drawRamps()`.
