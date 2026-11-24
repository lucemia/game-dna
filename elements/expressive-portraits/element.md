# D-04 Expressive portraits

## 1. What it is

Bust portraits in the 16-bit RPG style: head and shoulders at the game's native pixel size (48×48 or 64×64), hand-made-looking shading (5-step hue-shifted ramps, light from the top left) and a 1 px outline. Each character is a small seeded spec (age, gender, skin, head shape, hair style and colour, eyes and eye colour, brows, nose, mouth, ears, beard, hood / helmet / circlet / headband, scar / freckles / earring / eyepatch / blush, collar and two cloth colours, backdrop); parts the designer leaves out come from the seed, so `{seed: 41}` alone is already a complete face and the same spec always draws the same face.

Seven expressions change only the brows, the eyes and the mouth: neutral, happy, angry, sad, surprised, determined, hurt. The face blinks every few seconds, and while the dialogue box types the mouth cycles closed / half / open and closes at punctuation pauses.

Beside the H-01 dialogue box, the speaker's portrait slides in from its side in a framed panel, switches expression when a line carries `expr: 'angry'`, and dims while someone else speaks (two-sided conversations put the second speaker on the right, mirrored). Narration lines show no portrait. On its own, the same module draws framed panels for character select, party and status screens. Everything is original, neutral fantasy; varied ages, genders and skin tones; no real characters.

## 2. Default parameters

| Key | Default | Range | Meaning |
|---|---|---|---|
| `size` | 48 | 48, 64 | Portrait size in native px; the panel is size + 8 (window frame 4 px each side) |
| `layout` | left | left, right, two | Portrait side; `two` = first speaker left, the next right (mirrored) |
| `frame` | window | window, plate, none | Panel frame, drawn through the skin |
| `enter` | slide | slide, fade, none | How a portrait arrives and leaves |
| `enterMs` | 160 | 0–400 | Enter time; exit takes 3/4 of it |
| `listener` | dim | dim, hide | The portrait that is not speaking (and every portrait during narration) |
| `blinkMs` | 3600 | 0–8000 | Mean blink period (each character ×0.8–1.2 by seed); 0 = never |
| `mouthMs` | 90 | 40–200 | Time per mouth frame while letters type |
| `outline` | ink | ink, soft | `ink` = the skin's sprite outline colour; `soft` = 55 % toward ink from the neighbouring part's darkest tone |
| `backdrop` | tint | tint, skin, none | Panel background: the spec's `bg` in 4 dithered bands with a soft halo; or the skin's window fill |

## 3. Variants

- **Classic 16-bit RPG**: the defaults (48 px, left, window frame, slide 160 ms, dim).
- **Two-sided conversation**: `layout two`; both speakers on screen, the listener dimmed.
- **Large faces**: `size 64`, `enterMs 200`.
- **Quiet cutscene**: `enter fade`, `enterMs 300`, `listener hide`, `mouthMs 120`.
- **Soft outline, no frame**: `frame none`, `outline soft`, `backdrop none` (portraits standing on the scene).

## 4. Interface

**Needs**
- For conversations: an H-01 dialogue box. Only its public surface is used: `create({bounds, onLine})` options (the game passes `bounds: () => por.reserve(FIELD)` and `onLine: (l, i, c) => por.onLine(l, i, c)`), `dlg.rect()` and `dlg.state()` (`stage`, `shown`, `total`, `id`, `index`, `box`). `onTick` is not needed: the mouth follows `state().shown`.
- A fixed 60 Hz step that calls `por.update(ms)` next to every `dlg.update(ms)`, also while the box is busy.
- A cast: `{Name: spec}` keyed like the lines' `speaker` / `who` (or a line's `portrait` field); optional `getPortrait(key, line)`.
- The play field (`bounds`, the same one the box uses) and optional UI rects.

**Provides**
- The speaker's framed portrait beside the box: expression per line (`expr`), talking mouth, blink, enter / exit, listener dimming.
- `reserve(field)`: the field minus a column of `size + 8 + gap` px on each side that has portraits in the running conversation (unchanged outside conversations, or when less than 96 px would be left).
- `make`, `draw`, `drawPanel` for standalone screens; `rects()` for other overlays.

**Skins.** With `skin-api.js` loaded, the panel frame is `GameDNA_Skin.resolve(skin).frame(ctx, rect, {role: 'window' | 'plate', team: 'n'})`, the outline colour comes from `outline.sprite.color` (else `ink`), and `backdrop: 'skin'` uses `ui.fill`. Without it the module draws a built-in 4 px bevel frame and uses `#06061a`. The portrait pixels themselves are art, not skin tokens: they look the same in every skin, always at whole native pixels with smoothing off. The module is fully in `module/expressive-portraits.js` (global `GameDNA_Portraits`; API and a 15-line integration in `module/README.md`); the demo runs on it.

## 5. Screen rules (exact numbers)

- **Size and proportions (48 px; ×4/3 for 64)**: head top at y 6.5 (child 8.5), chin at 33 (child 34), eyes on the head's midline (child 55 %), cheek half-width 11.2 px (child 12, ±0.4 by gender), the jaw tapering over the last 30 % of the head (to about half the cheek width at the chin row); ears tucked 0.5 px into the head edge, one tone darker than the cheek, shoulders from 2.6 px under the chin, half-width 17.5 / 19 / 20.5 px (child 15). Eyes 4×4 px (almond 5×4, large 5×5, narrow 5×3), 4 px apart (inner corners), brows 2 rows above the lash line, nose tip 1 row under the eyes, mouth 4 / 6 px wide, centred on the face axis (between the two middle columns).
- **Shading**: 5 tones per material from a hue-shifted ramp (shadows lean toward blue, highlights toward yellow; skin tones are hand-picked ramps). The face is mostly tone 3 with the lit cheek and brow at 4 and the right edge at 1–2; the neck sits one tone darker with a shadow row under the jaw; hair gets curved strand lines and a broken shine band; hair meeting skin darkens to tone ≤1 and casts a 1-row shadow on the forehead.
- **Outline**: every transparent pixel 4-adjacent to the bust gets the outline colour; the bottom edge (cut by the frame) has none.
- **Eyes**: dark lash row on top (1 extra lash pixel at the outer corner for `female`), white rows below it (top white row one tone darker), iris 2–4 px wide centred with the pupil in its upper middle and a 1 px catchlight at the iris's top-left on BOTH eyes (light from the top left, never mirrored per eye), a soft lower lid (skin −1) under the middle columns.
- **Expressions** (brows: lift, inner end, outer end; + = down): neutral (0, 0, 0, slight arch) · happy (+1 up, arched; eyes closed upward arcs; smile with corners 1 row up) · angry (inner end 2 down, outer 1 up; inner top corner of the eye covered by the lid; frown) · sad (inner end 2 up, outer 1 down; outer top corner covered; small frown) · surprised (2 up, arched; lash row raised 1, white above the iris, 1 px pupil; round "o" mouth) · determined (inner end 1 down; lid lowered 1 row; firm line) · hurt (inner end 2 up; eyes squeezed shut as `>` `<` one row lower than the open eye, so a skin row separates them from the brows; gritted teeth 6 px wide with alternating tooth tones between dark rows, corners down; a 2×4 sweat drop at the temple on the lit side). Angry, sad, determined and hurt brows are 2 px thick at the inner end.
- **Brow contrast**: brow tone 0 is the hair's darkest mixed toward the line colour, and is replaced by the line colour whenever it is not at least 60 % darker (luminance) than the skin's tone 3; on dark skin (tone 2 luminance < 0.37) a 1 px tone-4 ridge highlight sits above the brow so its angle reads at 1×.
- **Blink**: the last 150 ms of each period: half (40 ms), closed (70 ms), half (40 ms). Happy and hurt eyes are already closed and do not blink.
- **Talking mouth**: frames half → open → half → closed every `mouthMs` while `state().stage === 'type'` and a letter appeared in the last 130 ms; closed during punctuation pauses, on a complete page and while another portrait speaks. Each expression has its own open shapes (smile → grin with teeth, angry / determined / hurt → teeth, surprised → bigger "o").
- **Panel and placement**: frame 4 px, portrait bottom-aligned inside it. Beside the box with a 4 px gap on its side; bottom-aligned with the box when the box is in the lower half of the field (a 3-row box is 46 px, so the 56 px panel rises 10 px above it, level with the name tag), top-aligned when the box is at the top. If that spot leaves the field, touches a UI rect or the box: on the box's top edge (bottom edge for a top box) at its left / right end. Never at the screen centre.
- **Enter / exit**: slide = from 28 px (half the panel) outside its spot, ease-out cubic, alpha in quarter steps in pixel skins; a new speaker on an occupied side waits for the old one's exit (3/4 of `enterMs`); the same speaker on a new line only changes expression (no re-entry). Listener dim: RGB × 0.5 plus a slight blue lift, backdrop under a 45 % dark wash.
- **Determinism**: portraits depend only on the spec; blink, mouth and transitions only on `update(dt)` (or the `t` given to `draw`). `?t=&freeze=1` gives identical frames.

## 6. Common mistakes (symptom → fix)

- The portrait covers the start of the text / overlaps the box → the box still has its static `bounds`; pass `bounds: () => por.reserve(FIELD)` (the module then falls back to sitting on the box's top edge).
- Every line shows the neutral face → `onLine` was not passed to the dialogue box's `create()` (a per-`open()` `onLine` is a different hook); add it, keep the old one.
- The mouth never moves / portraits never leave → `por.attach(dlg)` missing, or `por.update` is only called when the box is not busy; call it in both branches.
- Frozen shots differ between runs → `draw` got `performance.now()`; pass your step clock as `t`, or let the presenter's `update` drive it.
- `Identifier 'FIELD' has already been declared` → the game already uses that name; call the play-field constant something new (`TALK_FIELD`).
- Eyes look misaligned or doubled after mirroring → never flip with CSS or a non-integer transform; use `flip` (the module mirrors whole pixels and keeps both catchlights top-left).
- The face looks muddy at 2× or 3× → the canvas is scaled with smoothing on; keep `imageSmoothingEnabled = false` and integer CSS scale.
- A narration line looks as if the last speaker says it → narration lines (no cast portrait) dim every portrait on screen and close their mouths (`listener: 'hide'` removes them).
- A character gets a different face each session → no `seed` and no `name` in the spec; give each cast entry a fixed seed.
- The panel hides the HUD → pass the HUD as `uiRects`; the panel moves onto the box edge instead.

## 7. Acceptance moments

| Shot | Must be visible |
|---|---|
| `demo/?view=sheet&t=1000&freeze=1` | One character in all 7 expressions plus live, half and closed blink and both talk frames, every face with even eyes, centred mouth, shaded hair and skin, outline. |
| `demo/?view=sheet&seed=21&t=1000&freeze=1` and `&size=64` | A deep-skinned character with readable features; the 64 px set with the same proportions. |
| `demo/?view=dialog&t=2500&freeze=1` | Rook (determined) beside the box, mouth open while typing, box narrowed to start right of the panel, name tag on the box. |
| `demo/?view=dialog&layout=two&t=9000&freeze=1` | Mira (happy) left, Rook dimmed right, box between them. |
| `demo/?view=dialog&t=12000&freeze=1` and `&layout=two` | The narration line: every portrait dimmed, mouths closed, no name tag. |
| `demo/?view=dialog&layout=two&t=15000&freeze=1` | Oswin hurt: `>` `<` eyes under raised brows, gritted teeth in the beard, sweat drop; reads as pain, not laughter. |
| `demo/?view=cast&t=1600&freeze=1` | Character select: 8 varied characters (child to elder, genders, skin tones, headgear), the selected one bright and happy, the status window with a 64 px panel and stats. |
| `checks/hosts/topdown` `?t=2000&freeze=1` | The elder's happy portrait left of the box on the village map, HUD untouched. |
| `checks/hosts/battle` `?t=3600&freeze=1` | Bram dimmed left, Ivy surprised right (mirrored), the command panel untouched. |
| Phone width 500 px | No horizontal scroll; the canvas fills the width. |
