# E-03 Dissolve-out defeat

## 1. What it is

When a unit is defeated and leaves the field, it does not just vanish or fade: it blinks white for a moment, then its sprite breaks apart in one of four ways and is gone in about 0.5–1 s. The effect plays from a **snapshot** of the sprite taken on the defeat frame, so the game removes the unit at once: its turn order, victory check, wave clear and AI all run exactly as before, on the same frame. Nothing waits for the effect unless the game chooses to (a promise or `busy()`).

Variants:
- **Dither**: pixels disappear in a 4×4 ordered-dither pattern mixed with noise, slightly top-first; each pixel flashes the edge colour for a moment before it goes.
- **Slice**: the sprite splits into 2 px horizontal bands (1 px for sprites under 24 px tall), top band first; odd and even bands slide out in opposite directions while they fade, tinted with the edge colour.
- **Crumble**: the sprite falls apart from the top down into pixel (or 2–3 px) pieces that drop with gravity, bounce once at the unit's feet, settle as dust and fade.
- **Flash**: the blink turns into a solid silhouette in the edge colour that breaks up in a dither pattern.

## 2. Default parameters

| Key | Default | Range | Meaning |
|---|---|---|---|
| `variant` | dither | dither, slice, crumble, flash | How the sprite breaks up |
| `duration` | 700 ms | 300–1200 (module: 200–3000) | Dissolve time after the flash |
| `flash` | 100 ms | 0–240 | White blink before the dissolve (flash variant: at least 120) |
| `edge` | white | white, hot, cold, crit, none | Colour of the dissolving edge, slice tint, crumble sparks, flash silhouette (skin tokens `fx.white`, `fx.hot`, `fx.cold`, `fx.crit`) |
| `chunk` | 1 px | 1, 2, 3 | Crumble piece size |
| `spill` | 3 px | 0–8 | How far outside the unit's rect the effect may draw |

## 3. Variants

- **Dither fade (default)**: `dither`, 700 ms, flash 100, white edge.
- **Slice wipe**: `slice`, 650 ms, flash 80, cold edge.
- **Crumble to dust**: `crumble`, 900 ms, flash 100, hot sparks, 1 px pieces.
- **Quick flash-out**: `flash`, 450 ms, flash 160, white.

## 4. Interface

**Needs**
- A defeat event on the frame HP reaches 0, before the unit stops being drawn: the unit's id, the rect where its sprite is drawn on screen **now** (same rounding, hover and bob; without hit shakes or lunges), and the picture: the sprite image (`image`, optional `flipX`, `src` region) or a callback that draws the unit on a given context at its screen position (`drawSprite(ctx, rect)`).
- A world clock in ms, one `update(dt)` per fixed step, `0` while frozen.
- Optional: rects to keep clear (`uiRects()`), and the play field (`view`).

**Provides**
- A promise per defeat and `busy(id?)`, for code that wants to wait (never required).
- `lastDrawn()`: the rects drawn last frame, each with its id and variant.

**Delivery (v1).** `module/dissolve-defeat.js` (one global, `GameDNA_DissolveDefeat`; API and a 15-line integration in `module/README.md`). Colours, fade steps and particle gravity come from `GameDNA_Skin.resolve(options.skin)` when `skin-api.js` is loaded, and from built-in pixel16 values otherwise. The host calls `defeat(id, {rect, image | drawSprite, flipX})` from its HP function, stops drawing the unit, calls `update(dt)` every step and `draw(ctx)` after the units, and `clear()` where a battle starts. A missing rect draws nothing (one warning; never the screen centre); a snapshot that comes out empty (a `drawSprite` that drew on the wrong context) becomes a small dust puff at the rect; an unreadable cross-origin image falls back to the flash variant; host callbacks are wrapped in try/catch and `draw`/`update` never throw. Verified by two scratch integrations (`checks/hosts/battle`, `checks/hosts/tactics`) and the judge probe `judge/probes/dissolve-defeat.js`.

## 5. Screen rules (exact numbers)

Native canvas (256×224 in the demo), integer-scaled with nearest-neighbour. One sprite pixel = one native pixel.

- **Timeline**: `0 … flash` ms: the snapshot and its white silhouette alternate every 2 frames (33 ms), white first. `flash … flash + duration`: the dissolve, progress `q` 0 → 1 on the world clock (frame-stepped by the skin's `motion.stepMs`, 1/60 s in pixel16). At `flash + duration` nothing is left and `busy()` turns false.
- **Fades**: every alpha goes through the skin's fade steps (pixel16: 1, 0.75, 0.5, 0.25, then gone below 0.125). No smooth fades on pixel skins.
- **Dither**: threshold per pixel `t = 0.5·Bayer4(x, y) + 0.3·noise(x, y, seed) + 0.2·y/(h−1)`; a pixel is gone when `t < 1.12·q`, drawn in the edge colour when `t < 1.12·q + 0.1`, else in its own colour.
- **Slice**: bands of 2 px (1 px when `h < 24`); band `b` of `n` starts at `q = 0.5·b/(n−1)` and lasts `0.5`; its local `k` moves it `±k²·max(4, 0.6·w)` px (`0.8·w` when `h < 24`) (even bands left, odd right), alpha `step(1 − k)`, edge tint at full strength while `k < 0.2`, 0.6 after.
- **Crumble**: pieces of `chunk` px; piece at row `y` is released at `q = 0.62·y/(h−1) + 0.18·noise`; it starts with `vx ∈ ±0.35`, `vy ∈ [−0.45, 0]` px/frame, then gravity 0.12 px/frame² (skin `particles.gravity`), drag 0.02; floor = sprite bottom + min(spill, 2) px, bounce ×0.3 when faster than 0.6 px/frame. It shows the edge colour for the first 6 % of `q` (40 % of pieces), then its own colour darkened 20 % toward `ink`. On the floor its sideways speed halves every frame. Each piece blinks out on its own: from `f = t0 + 0.25·(1 − t0)` it vanishes at a seeded `q` between `f + 0.15·(1 − f)` and 1, at half alpha for the last 0.06 before that (so dust thins pixel by pixel, never fades as one sheet). A piece that would come within 1 px of the buffer edge (rect + spill) is removed at once, so no straight clip edge ever shows.
- **Flash**: silhouette in the edge colour (or the sprite's own colours with `edge: none`), alpha 1 until `q = 0.3`, then 0.75; a pixel is gone when `t < 1.25·(q − 0.1)` (the dither threshold above), so it is fully gone by `q ≈ 0.9`. Unreadable pixels: the whole silhouette at alpha `step((1 − q)²)`.
- **Clipping**: everything is drawn into the unit's own buffer (rect + `spill` on every side), then cut to `view` and to every `uiRects()` rect before it reaches the screen.
- **Draw order**: background → units → dissolves → hit effects → banners → HUD. Dissolves move with screen shake (pass the offset); the HUD does not.
- **Determinism**: no `Math.random`, no wall clock: noise is seeded by `seed`, the id and the n-th defeat of that id.

## 6. Common mistakes (symptom → fix)

- Old sprite fades out on top of the dissolve, or the unit "dies twice" → turn off the host's built-in death fade for units that dissolve (keep its counter if other code reads it).
- Dissolve appears a few pixels off, or jumps sideways → the rect must be where the image is drawn this frame (same rounding, hover, bob, mirroring); pass `flipX` when the sprite is drawn mirrored.
- Nothing shows, console says the snapshot is empty → `drawSprite` drew on the game's screen context; draw on the `ctx` argument.
- Victory banner comes later than before, or `?auto=1` ends differently → do not make the end-of-battle check wait for the effect.
- Dissolve freezes on the end screen or between waves → `update` must run every step, also during banners and menus.
- Leftover dust after a restart → `clear()` where a battle starts.
- Load error "cannot access before initialization" → `clear()` in a reset function that also runs before the instance exists; create the instance earlier (a `typeof` guard does not cover a `const` declared later).
- Revived heroes reappear while their dissolve still plays → do not dissolve units that stay on the field when down.
- Smooth, blurry fade on a pixel screen → leave fades to the module (stepped alpha), do not wrap `draw` in your own `globalAlpha`.

## 7. Acceptance moments

| Shot | Must be visible |
|---|---|
| `demo/?t=1250&freeze=1` | All four variants at once: the golem crumbled to falling dust on the floor, the wisp half-dithered with white edge pixels, the slime's bands sliding apart, the bat as a fading white silhouette; `VICTORY` already shown (the battle did not wait). |
| `demo/?t=1000&freeze=1` | Golem crumbling from the head down (top pieces falling past the intact legs), the bat still alive. |
| `demo/?t=1450&freeze=1&variant=crumble&chunk=2` | Golem already gone, wisp and slime as 2 px rubble at their feet, the bat crumbling from the top; nothing outside the units' rects + 3 px, no straight-edged dust box. |
| `demo/?t=1250&freeze=1&end=await` / `&t=2200` | No `VICTORY` while effects play; `VICTORY` once `busy()` is false. |
| Strips `shots/10–13`, `14` (golem floor, 50 ms) | Each variant every 50 ms from strike to gone: flash blink, dissolve, nothing left at flash + duration. |
| Phone width 500 px | Canvas fits without horizontal scroll. |
| Host integrations | `checks/hosts/battle` at `t=5250` (scorpion dithering away, beetle untouched) and `t=45250` (VICTORY on the defeat frame, last foe still dissolving under it); `checks/hosts/tactics` at `t=45250` (OUTPOST TAKEN with the warlord dissolving). |
