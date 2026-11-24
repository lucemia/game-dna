# L-02 Portrait set with expressions (`painted-portraits`)

## 1. What it is

Painted bust portraits for dialogue scenes in HD games. Each character is generated once, at build time, with Codex `image_gen`: a **neutral base** from a role prompt plus a STYLE LOCK paragraph, then each **expression as an edit of that base** (the base passed as `referenced_image_paths`), which keeps the identity, clothes and crop. An edit re-renders the whole picture, so the figure can come back a few pixels larger or shifted; `tools/portraitset.py` registers every edit onto its base by silhouette, cuts the whole set with one crop box and one flat bottom line, cleans the alpha and exports WebP. `assetcheck.py`'s `portrait-set` check proves the alignment per file.

In the game, `GameDNA_PaintedPortraits` (module) loads the files once and shows the speaker beside the dialogue box: the bust slides in and stands on the box's top edge, cross-fades to each line's `expr`, breathes, blinks on the neutral face, bobs gently while letters type, and dims while another character talks. Its presenter has the same hooks as D-04 `expressive-portraits`, so the H-01 dialogue box drives either; a game with its own text box uses `attach({rect})` and `onLine({speaker, expr})`.

The shipped sample cast: Maren (a town warden in her forties, deep brown skin, silver-streaked locs, olive cloak), Tobin (an eighteen-year-old apprentice scholar, light olive skin, curly hair, brass spectacles, mustard scarf) Hesper (a travelling merchant in her seventies, warm tan skin, silver bun with a pencil, plum shawl) and Oswin (a stout village shopkeeper in his fifties, ruddy light skin, chestnut beard, green cap, rust waistcoat). Each has neutral, happy, angry, sad, surprised, determined and blink: 28 files.

## 2. Default parameters

| key | default | meaning |
|---|---|---|
| `layout` | `two` | first speaker left, next right (`left`, `right`: everyone on one side; a cast entry's `side` wins) |
| `place` | `stand` | the bust stands on the box's top edge, its flat cut hidden behind the box (`beside`: next to the box, D-04 style, the box narrowed through `reserve`) |
| `height` | 0 | drawn height in field units; 0 = 46 % of the field height (166 px on 640×360, 83 on 320×180) |
| `enter`, `enterMs` | `slide`, 260 | slide 30 % of the bust width (≤ 64 px) with an eased fade; exit = ¾ of the time |
| `fadeMs` | 180 | cross-fade between expressions (old image fades over the first half, new over the whole time) |
| `listener`, `dim` | `dim`, 0.45 | the other portrait darkens to 45 % navy over 160 ms and sinks 2.5 % of its height (`hide`: leaves) |
| `breathe`, `breatheMs` | 1, 3800 | vertical scale ±0.7 %, horizontal ±0.25 %, anchored at the bottom |
| `blinkMs` | 4200 | a 130 ms blink once per cycle (position jittered per cycle, a double blink in one cycle of four); neutral face only |
| `talk` | `bob` | while the box types: up to 1.4 px bob (scales with height) |
| `shadow` | 0.35 | soft shadow behind the bust: the neutral silhouette blurred once (5 % of its height, cached), drawn 5 px toward the screen centre and 2 px down |
| `inset`, `gap`, `margin` | 18, 6, 6 | px from the box's end; gap beside the box (`beside`); margin from the field |

Generation defaults (prompt.md): expressions `neutral, happy, angry, sad, surprised, determined, blink`; style "modern hand-painted 2D character portrait", key light TOP-LEFT; stored height 336 px (2× the drawn height on 640×360); WebP quality 84.

## 3. Variants

- **Two-sided conversation** (default): `layout: two`, `place: stand`, `listener: dim`.
- **Single speaker, quiet**: `layout: left`, `enter: fade`, `enterMs: 400`, `listener: hide`, `breathe: 0.6`.
- **Beside the box** (D-04 placement): `place: beside`: the box gets narrower, the bust stands bottom-aligned next to it.
- **Snappy cuts**: `enter: none`, `fadeMs: 0`, `breathe: 0`, `blinkMs: 0` (whole-image swaps only).

## 4. Interface

Needs: an H-01 dialogue box whose lines carry `speaker` / `who` and `expr` (or the game's own box through `attach({rect, typing})` + `onLine({speaker, expr})`); a fixed 60 Hz step that also runs while the box is busy; the field the box uses; the boot moved into `por.onReady(boot)`; the image files (shipped cast, or the designer's own from `prompt.md`); optional UI rects.

Provides: the bust beside / on the box with per-line expressions, cross-fade, enter / exit, breathing, blink, talking bob and listener dimming; `drawPanel` for status / shop screens; `rects()` / `lastDrawn()` for overlays and tests; the manifest with provenance and alignment; `portraitset.py` and the `portrait-set` check.

API compatibility with D-04: `create({cast, getPortrait, bounds, view, uiRects, params})`, `onLine(line, i, ctl)`, `reserve(field)`, `attach(dlg)`, `update(dt)`, `draw(ctx)`, `show / expr / talk / hide / clear`, `rects / lastDrawn / state / portrait / setParams / params / panelSize`. Differences: cast entries are files, not specs; `onReady` gates the boot; six expressions (D-04's `hurt` is an alias of `sad`).

## 5. Screen rules (exact numbers)

- The bust's flat bottom cut is never visible: in `stand` it is placed 6 % of its height below the box's top edge and clipped at that edge (and around the H-01 name tag, which stays in front).
- Height = `height` or 46 % of the field, capped so the top stays `margin` (6) px inside the field: `h ≤ (box.y − field.y − 6) / 0.94`.
- Horizontal: `inset` (18) px from the box's left / right end, clamped inside the field; width ≤ half the box − `inset` − `gap`, so two busts never meet. Never at the screen centre.
- The H-01 name tag stays in front: the clip's hole covers only the part of the tag above the box's top edge; no bust pixel is drawn below that edge (`checks/tagcheck.py`: pixels from the box's top edge down are identical with and without portraits, 3 skins × 2 layouts × 7 moments).
- `beside`: the bust's foot line is the field's bottom edge (4 % below it), so the flat cut is off screen.
- A HUD rect above the box: the bust shrinks (foot line fixed) to clear it, down to 55 % of its height; below that it is drawn anyway with one warning.
- The speaker is drawn last (in front). The listener: 45 % navy (`rgba(12,14,30,0.45)` over the image), 2.5 % lower.
- A right-side portrait of a character painted facing right is mirrored (faces the screen centre); `flip: 'never'` / `noFlip` keeps it.
- Files: one canvas per character (all expressions identical w × h), alignment `portrait-set`: zero-offset silhouette IoU ≥ 0.93, best shift within ±6 px is 0 ± 1 px, same bottom cut ± 1 px, mean RGB difference over the clothes ≤ 24.
- Stored at about 2× the default drawn height on 640×360 (336 px); pack ≤ 600 KB.

## 6. Common mistakes (symptom → fix)

- Frozen screenshot (`?t=&freeze=1`) without portraits, or different on each load → the old boot still runs directly; boot only from `por.onReady(boot)`.
- Every line shows the neutral face → `onLine` was passed to `open(..., {onLine})` instead of the box's `create({onLine})`; or lines have no `expr`.
- The bust jumps when the expression changes → the expression files were not aligned (re-run `portraitset.py build`; `assetcheck.py` `portrait-set` must pass).
- A grey or dark fringe around the hair → resized without `alpha` cleanup; run the `post` chain (`portraitset` → `alpha --defringe 3` → `export`).
- Portraits never leave → `por.attach(dlg)` missing, or `por.update` runs only when the box is not busy.
- The bust floats with a visible bottom edge → drawn before the box or in another coordinate space than the box; draw right after the box, inside the same scale.
- The bust is tiny or covers the whole screen → `bounds` is in a different unit than the box (e.g. 640×360 while the box is drawn in a 320×180 scaled layer); give the box's own field.
- Blurry faces → drawn far larger than the stored file (store ≈ 2× the drawn height), or the game scaled the canvas with CSS without a backing scale.
- A character's scar or parting switches sides → the portrait is mirrored on the right; set `noFlip: true` for that character.
- `Identifier 'FIELD' has already been declared` → the game already has that name; pick a new one (`TALK_FIELD`).
- Regenerate: the edit changed the outfit or zoom → the edit prompt lost "change ONLY the facial expression … keep the same position, size and crop"; regenerate that one edit (the `portrait-set` body-difference check catches it).

## 7. Acceptance moments

| moment | what must be visible |
|---|---|
| A character's first line | their bust sliding in at the box's left (or right) end, standing on its top edge, the name tag in front of it, nothing covering the text |
| A tagged line (`expr: angry`) | the angry face; mid cross-fade at +90 ms both faces blend with the bust not moving |
| Two speakers | the listener darker and slightly lower, the speaker in front; when the speaker changes, the dimming swaps |
| A neutral line held for 5 s | at least one blink (eyes closed for ~130 ms) and a visible breathing scale change between frames |
| Narration line | no new portrait; the ones on screen dim |
| The box closes | both busts slide out within ~200 ms from where they stood, the flat cut fading out softly (no straight edge once the box is gone); nothing left on screen |
| `?t=<ms>&freeze=1` twice | byte-identical frames, portraits included; `?auto=1` ends as before with no errors |
| Cast contact sheet | 4 characters × 7 files on one canvas each; a flip-book of a row shows only the face changing |
