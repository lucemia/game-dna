# J-03 Bloom & glow

## 1. What it is

Bright light bleeds softly into its surroundings, as it does in a lens or an eye. Two sources feed the glow. **Bright pixels**: every pixel whose brightest RGB channel is above a threshold (0..1) with a soft knee, so the glow fades in instead of switching on. **The emissive layer**: a transparent canvas the size of the game canvas into which the game, each frame, redraws only what it wants to glow (a fireball, a lantern, crystal shards, coins, a selected skill), at the same on-screen positions. Emissive things glow whatever their brightness, so a pixel game can make its fireballs glow without its white HUD text and white clouds blooming. The glow is blurred with a dual-filter mip chain (1/2, 1/4, 1/8, 1/16 resolution), tinted, and added or screened back. A big hit can call `flare()`: for a moment everything glows harder and a soft light bursts at the contact point. HUD rectangles neither glow nor receive glow; the glow fades out a few pixels before them.

It is a J-family element built on I-08: six passes added to the shared `GameDNA_Post` chain (order 600-605, the bloom band). It works with the game's own I-08 instance or creates one. Without WebGL, or with `?webgl=0`, nothing changes.

## 2. Default parameters

| Key | Default | Range | Meaning |
|---|---|---|---|
| `source` | emissive (prompt), both (module) | both, luma, emissive | What glows: bright pixels, the emissive layer, or both. The prompt teaches `emissive` for any scene with large bright areas; `both` for dark scenes |
| `threshold` | 0.78 | 0–1 | Brightest-channel value where the glow starts (8-bit buffers: no value above 1) |
| `knee` | 0.5 | 0–1 | Soft knee as a fraction of the threshold (the glow starts at threshold × (1 − knee)) |
| `intensity` | 1.6 | 0–3 | Strength of the glow |
| `radius` | 0.75 | 0–1 | Light moved from the tight levels (1/2) to the wide ones (1/8, 1/16); blur tap spread 1 + 0.75 × radius |
| `tint` | #fff1dc | colour | Multiplies the glow (warm white) |
| `blend` | add | add, screen | Screen never clips to white (daylight, bright scenes) |
| `emissiveGain` | 1.2 | 0–3 | Strength of the emissive layer |
| `flareDecay` | 420 ms | 16– | Module-only: flare fade time, game clock |
| `uiFeather` | 6 px | 0–32 | Module-only: distance over which glow fades out before a HUD rect |
| `adapt` | 1 | 0–1 | Module-only: scene-brightness guard (bright-pixel bloom and flares back off on bright scenes, see §5) |

## 3. Variants

- **Soft night** (default): both sources, warm tint, medium radius.
- **Neon**: threshold 0.7, intensity 2.2, radius 0.45, pink tint, emissive gain 1.8.
- **Dreamy**: threshold 0.55, knee 0.8, intensity 2.0, radius 1, cool tint, emissive gain 1.6.
- **Crisp pixels**: emissive only, threshold 0.95, intensity 1.8, radius 0.3, white.
- **Daylight**: emissive only, intensity 1.0, radius 0.6, screen; halos via `glow()` at alpha 0.5–0.6, sprites not redrawn (the demo's Daylight preset; the side-scroller host uses 1.1).

## 4. Interface

**Needs**
- I-08 `webgl-post.js` loaded first (`GameDNA_Post`); the game's instance passed as `post`, or the module makes one.
- `render()` (or `post.render()`) once per drawn frame on every draw path, including the single draw after the `?t=` fast-forward.
- Optional: the game's step clock in ms (flare fading, deterministic freezes); HUD rects (`uiRects`, canvas px or `view` units) or a `uiMask` canvas; per-frame emissive drawing; big-hit events with a contact point.

**Provides**
- Bloom passes on the post chain; `emissive()` (the layer's 2D context, cleared on the first call after each post frame) and `glow(x, y, r, color, alpha)`.
- `flare(strength, {at, decay})`; `clear()`; `setParams`, `setEnabled`, `setUiRects`; `stats()`.

**Delivery (v1).** `module/bloom-glow.js` (one global `GameDNA_Bloom`; API, a 15-line integration and a self-check in `module/README.md`), shipped with `webgl-post.js`. The module draws nothing on the game canvas. Colours given to `tint` and `glow()` may be skin tokens (`fx.hot`) resolved through `GameDNA_Skin.resolve(options.skin)`; without `skin-api.js` they are plain CSS colours.

## 5. Screen rules (exact numbers)

- **Threshold**: br = max(r, g, b) of the incoming pixel; kw = threshold × knee; q = clamp(br − threshold + kw, 0, 2kw)² / 4kw; weight = max(q, br − threshold) / curve(1), clamped to 0..1, so pure white passes fully. Defaults: br 0.9 → 0.70, 0.6 → 0.12, ≤ 0.39 → 0.
- **Bright pass** (1/2 res): four taps 1 device px apart, Karis-weighted (1 / (1 + luma)) so single bright pixels do not flicker; plus emissive rgb × alpha × `emissiveGain`; multiplied by (1 − HUD mask).
- **Blur**: 13-tap downsample (inner 2×2 box ×0.5, outer 3×3 grid of 2-texel taps ×0.5) to 1/4, 1/8, 1/16, taps spread 1 + 0.75 × radius texels. Up pass at 1/4: wide = tent(1/16) × (0.45 + 0.45r) + tent(1/8) × (0.55 − 0.45r) (8-tap tents), mixed with the 1/4 level by k = (0.45 + 0.75r) / (0.9 + 0.55r).
- **Composite** (full res, 5 reads): core = bright(1/2) × 1.6 × (0.45 − 0.35r) × (1 − smoothstep(0.65, 1, max(c))) (the tight level stays off what is already near white); glow = (up × 1.6 × (0.9 + 0.55r) × (1 + 1.2f) + core) × tint × intensity. `add` is a soft add, o = c + (1 − c)(1 − e^(−glow)) (≈ c + glow on dark pixels, never a flat clip: the moon keeps its craters); `screen` = 1 − (1 − c)(1 − glow). ±0.5/255 dither where glow > 0.002.
- **HUD**: an exact mask (white = HUD, magenta `#ff00ff` = glow hole) and a low-res fade map (linear ramps, 1 at a rect edge to 0 at `uiFeather` px out; red = HUD, green = hole) are drawn on the CPU and uploaded only when the rects change; a rect's `r` rounds the mask, the hole and the fade like the panel, and `soft` fades the mask out beyond the rect (v1.1). HUD pixels, hole pixels included, are output unchanged, so a label inside a glowing button stays crisp. Near a HUD rect the glow is multiplied by 1 − fade. A hole emits (what the game draws into the emissive layer there), and its glow spills onto the HUD within `uiFeather` around it, fading out. A game's own `uiMask` may use `#0000ff` for a hole that also receives glow inside.
- **Flare**: f = strength × (1 − dt / decay)², dt in game ms; only the wide levels get stronger (× (1 + 1.2f)); the threshold and the tight level are unchanged, so the peak is a soft round bloom, not a white slab; with `at`, a burst of 0.45f × tint × (0.75 e^(−q) + 0.25 e^(−q/9)), q = d² / R², R = (0.06 + 0.06 × strength) × screen height. A new flare takes max(old remaining, new). Clock going back drops it.
- **Scene-brightness guard** (`adapt` 1): every 4th game frame the canvas is sampled at 16 px wide; cover = share above threshold × (1 − knee/2), mean = mean brightest channel. Bright-pixel bloom × (1 − 0.97 · smoothstep(0.06, 0.3, cover)); flare × (1 − 0.8 · smoothstep(0.3, 0.65, mean)), capped at 1.2; intensity × (1 − 0.4 · smoothstep(0.45, 0.8, mean)).
- **Watchdog frames** (I-08 repaints without a `render()` call): the last emissive layer is kept, so frozen screenshots still glow.
- **Cost**: six passes; only the composite is full resolution. Measured numbers in `module/README.md`.

## 6. Common mistakes (symptom → fix)

- The whole sky, white clouds or white text glow → luminance bloom on a bright scene; use `source: 'emissive'` or threshold 0.9+.
- HUD text has a halo or panels look washed → the HUD is not in `uiRects`, or the rects are in the wrong units (a 2× backing store: pass `view`).
- A dark rectangle (no glow) somewhere in the world → a `uiRects` entry in the wrong units or left over from a closed menu; return only what is drawn now.
- A lighter or un-bloomed box behind a title or a floating label → a tight rect around text that has no backing plate; mask whole plates only, leave plate-less text out (or draw it a backing box), never a full-canvas rect for a title screen.
- Glow appears beside the thing, or slides when the camera moves → emissive drawn in world coordinates; subtract the camera exactly as the game's draw does.
- Glow flickers on and off, or a frozen screenshot shows none → `emissive()` drawing sits in only some draw paths, or in the update step; draw it in every draw path, after the `?t=` fast-forward too.
- Two overlays, double grade, the game looks blurry → `GameDNA_Post.create` called twice; create it once and pass it as `post`.
- Everything blooms white for a second on every hit → `flare` inside a per-frame overlap loop, or 1.2 on every hit; call it once on accepted big hits only.
- The game ends differently with `?webgl=0` → game logic read `bloom.active` or the overlay.

## 7. Acceptance moments

| Shot | Must be visible |
|---|---|
| `demo/?t=1100&freeze=1&split=0.5` | Left half without bloom, right half with: lanterns, fireball and moon glow on the right only; HUD identical on both sides. |
| `demo/?t=900&freeze=1` | Soft preset: moon with a wide halo, four lanterns glowing, fireball trail glowing, golem crystals glowing cyan, white HUD text crisp, the selected skill (Fireball) glowing through its hole. |
| `demo/?t=6340&freeze=1` | Nova impact: flare at full, lanterns brighter, light burst on the golem. |
| `demo/?t=900&freeze=1&ui=0&threshold=0.5` | HUD unprotected: HP bars and panel borders bloom (what `uiRects` prevents). |
| `demo/?t=900&freeze=1&source=emissive` | Only marked things glow; the moon does not. |
| `demo/?t=900&freeze=1&res=px` | 320×180 pixel canvas: same glow, pixels sharp. |
| `demo/?t=900&freeze=1&webgl=0` | Plain 2D picture, no errors. |
| Hosts (`checks/hosts/`) | Battle: sun disc and spells glow, panel, caption and banner crisp, a killing blow flares. Side-scroller: coins and flag finial glow on a daylight sky that does not bloom, HUD crisp, a kill flares. `?auto=1` ends as the original with WebGL on and off. |
