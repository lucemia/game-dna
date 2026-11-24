# D-01 Palette-swap variants

## 1. What it is

The classic way to get many characters out of one sprite: keep the shapes, swap the colours. The module looks at a sprite the game already has, groups its colours into ramps (a garment's shadow, base and highlight; the skin; the steel; the outline), and builds a new sprite in which a ramp is replaced by another ramp of the same dark-to-light order. That gives team colours (the same soldier in blue, red, green or yellow), an elite or rare foe (the same beast in violet with a tinted outline, or in a pale "shiny" cyan), status looks over the whole sprite (sickly green poison, grey stone, ice blue frozen, a red tint that pulses at low HP) and a greyed "already acted" look. Looks combine with `+` (`team-red+spent`, `elite+poison`).

Each (sprite, variant) is built once from the sprite's pixels and cached, so the game can ask for it every frame. The game keeps its art, rules and state: the integration is the image argument of the existing draw call, `drawImage(PS.variant(sprite, name), x, y)`.

## 2. Default parameters

| Key | Default | Range | Meaning |
|---|---|---|---|
| `uses` | units: team colour per side (player blue, enemy red); a unit that has already acted this turn: greyed; units below a quarter of their HP: low-HP pulse | text, **required** | Which sprites get which looks, in the designer's words. The prompt says: recolour exactly these, nothing else |
| `hueTol` | 24 | 8–60° | Two colours belong to one ramp when `hueDiff / hueTol + max(0, |satDiff| − 0.15) / 0.35 ≤ 1` (single linkage) |
| `protectSkin` | auto | auto, on, off | Skin-like colours stay out of team swaps (auto: unless they are the biggest colour group) |
| `target` | primary | primary, primary+secondary, all | Which detected ramps a team, elite or rare swap recolours |
| `strength` | 0.6 | 0.2–1 | Mix toward the tint for `poison` and the peak of `lowhp`; `frozen` uses strength + 0.15; `petrify` 1 |
| `pulseHz` | 2 | 0.5–4 | Low-HP pulse rate |
| `pulseSteps` | 4 | 2–8 | Cached steps of the pulse (step 0 = the sprite itself) |
| `spentDim` | 0.6 | 0.3–0.9 | Brightness of the greyed look |
| `keepOutline` | on | on, off | Colours with luma < 0.13 keep their colour in every variant |
| `elite` | violet | violet, crimson, gold, shadow | Ramp for `elite` |
| `eliteEdge` | on | on, off | Elite outline mixed 75 % toward a dark tint of the elite ramp |

## 3. Variants

- **Tactics sides** (defaults): player units `team-blue`, enemies `team-red`; a player unit that has acted this phase `team-blue+spent`.
- **Battle foes and status**: the strongest foe of the last wave `elite`; a unit under a status `+poison`; heroes below 25 % HP `+lowhp`.
- **Shiny rares**: foes the game marks as rare (or picked by wave number, never by a new roll) `rare`, `target: primary+secondary`.
- **Gold champions**: `elite` with `elite: gold`, `target: all`.
- **Soft status**: `strength` 0.4, pulse 1.25 Hz in 6 steps.

## 4. Interface

**Needs**
- The sprite the game already draws, as a long-lived object: a canvas, a loaded `<img>`, an `ImageBitmap`, or a palette-indexed string sprite `{rows, pal}` (baked once by `fromRows`).
- State that names the look: side or team, acted flag, elite flag, status, HP. Where a look has no state (elite in a game with no elites), a plain visual flag that no rule reads.
- Each draw site of the sprite: its image argument becomes `variant(sprite, name)`.
- Optional: `update(stepMs)` once per fixed step, for the `lowhp` pulse.

**Provides**
- `variant(sprite, name, {level})` → a cached canvas of the same size (or the sprite itself for `base`, unknown names, unloaded or unreadable images; warns once).
- `ramps(sprite)` → `[{role, colors, pixels, hue}]`; `setRamps(sprite, {primary, secondary, skin})` for explicit mapping; `define(name, spec)` for new looks.
- `stats()` → `{calls, hits, builds, variants, sources, buildMs, fallbacks, rebuilds, hitRate}`; `drawRamps(ctx, sprite, x, y, opts)` inspector.

**Delivery (v1).** `module/palette-swap.js` (one global, `GameDNA_PaletteSwap`; API, variant names, string-sprite format, 15-line integration and self-check in `module/README.md`). The module recolours pixels; the game draws them. When `skins/skin-api.js` is loaded, the `team-a` / `team-b` / `team-n` ramps come from `skin.palette.team` and `drawRamps()` draws through `skin.frame` / `skin.text`; without it, built-in pixel16 colours. Verified on two unseen hosts (scratch copies): the tactics skirmish (team colour per side, greyed after acting) and the side-view battle (elite wyrm in the last wave, poison tint after Mind Leech, low-HP pulse): 0 errors, `?auto=1` ends the same as the original. The demo runs on the same module.

## 5. Screen rules (exact numbers)

- **Sizes**: a variant has exactly the sprite's width, height and alpha. Pixels with alpha < 16 are copied unchanged.
- **Colour classes** (per unique RGB; more than 768 unique colours → 5-bit-per-channel buckets, each pixel keeps its offset from its bucket):
  - outline: luma (0.299 R + 0.587 G + 0.114 B) < 0.13 (when `keepOutline` is on);
  - neutral: max − min channel < 22, or HSL saturation < 0.14, or luma > 0.92 with saturation < 0.45 (steel, greys, white glints): never recoloured by ramp swaps;
  - skin-like: hue 10–48°, saturation 0.25–0.92, lightness 0.5–0.9 (faces, hands, gold trim);
  - everything else is clustered into ramps (rule in §2). Ramps are ordered by pixel count, a ramp whose pixels are mostly brown (hue 12–50°, lightness < 0.5: leather, wood, hair) counting half, so clothing beats belts and bows: `primary`, `secondary`, `accent1`…; each ramp's colours are sorted by luma.
- **Ramp swap** (team, elite, rare): a ramp of n colours, lightest luma `yL`, darkest `yD`, gets the window `lo = (yD − 0.08) / 0.84`, `hi = (yL − 0.08) / 0.84` (clamped to 0..1, widened to at least 0.4 around its centre); colour i (dark → light) takes the target ramp sampled at `lo + (hi − lo) · i / (n − 1)` (linear between its 5 stops). Order is kept by construction.
- **Target ramps** (dark → light): blue `#141e58 #2440a0 #3a6ce0 #78a8f6 #c8e0ff`; red `#4a0c14 #94182a #d23a30 #f2845c #ffd2b4`; green `#10361a #1f6a2a #38a43a #7cd65a #d2f6a2`; yellow `#4e3006 #966010 #dca21c #f6d64c #fff6b4`; elite violet `#1e0828 #4a1256 #88268a #cc52b0 #ffaee0` (also crimson, gold, shadow); rare `#123040 #246c80 #3eb0be #8ce8de #eefffa`. **Contrast rule** (elite and rare only, never teams): when the chosen ramp's base hue is within 45° of the sprite's primary hue, the candidate farthest from it is used instead (elite: violet, crimson, gold; rare: cyan or pink `#3a1430 #7a3466 #d06aa2 #f8b0cc #fff0f4`), so a violet sage turns gold, not violet. `team-a/b/n`: 5 steps from the skin colour at lightness 0.15 / 0.30 / 0.46 / 0.66 / 0.86, shadows hue-shifted up to 16° toward blue, lights toward yellow.
- **Tints** (whole sprite except the outline): each colour moves toward the tint ramp sampled at `(luma − 0.06) / 0.88`: poison `#1c1430 #3e2a5a #5e8a2a #9ed24a #e4ff9c` × `strength`; frozen `#0e2448 #24569a #56a0e2 #a6dcff #f4fdff` × (`strength` + 0.15); petrify `#2a2624 #524c46 #837b70 #b6ae9f #e8e2d4` × 1; lowhp `#3a0606 #8a1210 #e0301c #ff7a5a #ffd4c4` × `strength` × pulse level.
- **Spent**: grey `v = luma × spentDim × 255`, colour `(v, v, v + 10)`.
- **Chains**: ramp swaps first, then tints, in name order within each group.
- **Pulse**: level = round(((1 − cos 2π · t · pulseHz) / 2) · (steps − 1)) / (steps − 1), t = module clock (sum of `update` ms). With the defaults, peaks at t = 250, 750, 1250… ms and the sprite itself at 0, 500, 1000….
- **Cache**: key = (sprite object, name, pulse level). A sprite whose width or height changes is re-read. More than 256 cached sprite objects → one warning. `stats().variants` / `sources` count what is cached now (`setParams` empties the cache); `builds` is cumulative.
- **Clock warning**: `lowhp` asked for more than 120 times while `update()` has never run → one warning (a single frozen frame does not warn).
- **Inspector** (`drawRamps`): 9 px rows, label column as wide as the longest label + 5 px, accents numbered (`ACC 1`, `ACC 2`), rows that do not fit become `N MORE`; without a skin the labels use a built-in 3×5 pixel font.

## 6. Common mistakes (symptom → fix)

- Nothing changes colour, console says "unknown variant" → a typo or a name not in the list (`team-purple`); use a listed name or `define()` it first.
- Every frame is slow and the warning "many new sprite objects" appears → the draw function builds a new canvas per frame and passes it in; pass the baked sprite.
- The variant shows old pixels after the game repaints its sprite canvas → call `invalidate(sprite)` after repainting.
- Faces turn blue on the blue team → skin was merged into the clothing ramp (its hue is close to red cloth); set `protectSkin: 'on'`, or `setRamps(sprite, {primary: [...]})` with only the cloth colours.
- Half a garment changes colour → its shading is hue-shifted more than `hueTol`; raise `hueTol`, or list the ramp in `setRamps`.
- The boots or hair change with the team colour → they joined the primary ramp; lower `hueTol` or list the ramp explicitly.
- Enemies stay grey through the whole player phase → an added "acted" flag is cleared when the enemy phase starts again; `spent` means "acted during the current phase of its own side": reuse the game's own flag and guard, or clear an added flag where that side's phase ends (cold test M8, 2 of 3 tactics runs).
- A hood or cloak keeps its old colour while the tunic changes → `setRamps` listed only some colours; let detection pick the ramps.
- The hit flash blends the old colours over the team colour → an overlay pass still redraws the base sprite; give every pass the same variant.
- The low-HP pulse never moves, or frozen screenshots differ → `update()` is not in the fixed step (or only in the `requestAnimationFrame` loop); call it once per step.
- The hit flash or "dead" frame lost its look → the variant was applied to the game's white or grey frame; recolour only the normal frame.
- Autoplay ends differently → the integration rolled the RNG to pick elites or rares; derive looks from existing state or wave numbers.
- A cross-origin image stays unchanged with a warning → its pixels cannot be read; serve it from the same origin or bake it to a canvas.

## 7. Acceptance moments

| Shot | Must be visible |
|---|---|
| `demo/?t=1000&freeze=1&skin=none` | Built-in drawing: 3×5 pixel-font labels and inspector, a 1 px corner bracket on the selected cell. |
| `demo/?t=2000&freeze=1` | Roster of 6 original sprites (knight, sage, ranger, slime, hound, drake) × 12 looks (original, blue, red, green, yellow, elite, rare, poison, stone, ice, low HP, red + greyed); each team column reads as one team; faces and steel unchanged; the inspector shows the knight's ramps and the green mapping. |
| `demo/?t=11250&freeze=1` | Tour on the sage, red column; the LOW column at its pulse peak (red tint), 2× preview in red. |
| `demo/?t=1000&freeze=1&sprite=5&variant=elite` | Drake elite: violet body, outline tinted, tan belly kept (skin-like colours protected). |
| `demo/?t=1000&freeze=1&sprite=5&variant=team-blue&ramps=hand` | Hand-set ramps: the belly listed in the primary ramp turns blue too; the inspector shows six colours mapped. |
| `demo/?t=1000&freeze=1&sprite=2&variant=team-blue` | Default `hueTol` 24: the ranger's green hood and cloak are the primary ramp and turn blue; the brown leather (secondary, counted half) stays brown. |
| `demo/?t=1000&freeze=1&sprite=2&variant=team-blue&hueTol=8` | Too low a tolerance: the hood splits into three one-colour ramps (`ACC 1`, `ACC 2`, `2 MORE`), the leather becomes primary and turns blue while the hood stays green. |
| `demo/?t=7333&freeze=1` twice | Byte-identical canvases. |
| Phone width 500 px | Canvas at 1×, no horizontal scroll. |
| `hosts-unseen/tactics` + module, `?t=10500&freeze=1` | Player units all in team blue (the green ranger too), the purple warlord and raiders in team red; the acted captain greyed. |
| `hosts-unseen/battle` + module, `?t=15000&freeze=1` / `35250` | Bram in poison green after Mind Leech; at 35250 the wave-3 wyrm in elite violet and Ivy (13/66 HP) at the low-HP pulse peak. |
