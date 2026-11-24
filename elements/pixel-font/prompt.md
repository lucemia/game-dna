# Add a crisp pixel bitmap font to my game

Defaults (change any of these before pasting):
`{{font}}` = regular · `{{hudFont}}` = small · `{{scale}}` = 1 · `{{shadow}}` = drop · `{{color}}` = white · `{{cps}}` = 40 · `{{blipEvery}}` = 2 · `{{pause}}` = 160

---

You are given `pixel-font.js`, a finished text module, and its README. **Include it verbatim** (`<script src>` before the game script, or pasted unchanged into its own `<script>`). Never rewrite it. It defines one global, `GameDNA_PixelFont`; the README has the API.

**Integration points** (find them in my game and list them first):

1. **Create once**, after the canvas context exists:
   `const PF = GameDNA_PixelFont.create({ params: { font: '{{font}}', scale: {{scale}}, shadow: '{{shadow}}', color: '{{color}}', cps: {{cps}}, blipEvery: {{blipEvery}}, pause: {{pause}} }, onBlip })`. `onBlip` plays the game's blip sound, if any.
2. **Text helpers.** Grep `fillText`, `strokeText`, `measureText`, `ctx.font` and any bitmap-text helper with its width helper. Keep each helper's name, parameters and return value; replace only its body with `PF.draw(ctx, str, x, y, {color, align, scale, font})` / `PF.measure(str, {font, scale})`. A bare `ctx.fillText(s, x, y)` becomes `PF.fillText(ctx, s, x, y)`. Old big sizes map to whole-number `scale`. **Font roles:** HUD values and short labels (HP, MP, lives, score, timers, names in status rows) use `font: '{{hudFont}}'`; messages, captions, dialogue, menus and titles use `{{font}}`.
3. **Widths.** Glyph widths change: everything placed by a width (right-aligned numbers, centred titles, columns, boxes around text) uses `PF.measure`. Check each layout still fits its window and the canvas; use `{{hudFont}}` or `fit: <px>` where tight. Never drop information to make room.
4. **Typewriter (required).** Every text the player reads as a message, caption, banner subtitle, action name or dialogue line, even a short or passing one, reveals with the typewriter. Only static HUD values and labels, menus and titles are drawn at once. At each place the game SETS such text (in the update step, not the draw pass): `PF.typewriter(id, text, {width, restart: true})`; where it was drawn: `PF.drawTyped(ctx, id, x, y, {cursor: true})`. If a confirm key already advances messages, put `if (!PF.skip(id)) return;` first. Add no new key handlers.
5. **Clock.** `PF.update(stepMs)` once per fixed update step, the same step that `?t=` / freeze / autoplay replays run.
6. **Crisp scaling.** A CSS-scaled canvas gets `image-rendering: pixelated`.

Colour codes go inside strings: `'HP {gold}120{/}/150'`, `{red}`, `{#8af}`; `{p300}` pauses a typewriter.

Keep every caller working (`?auto=1`, `?t=&freeze=1`, shortcuts, restart, title/end screens, test hooks). Never remove or rename functions.

**Self-check without a browser**
- The module file is byte-identical to the one given and loads before the first `PF` use.
- List every former text call site and what draws it now; grep finds no `fillText` left in game code.
- List every set site of message/caption/action-name/dialogue text and its `PF.typewriter(..., {restart: true})` call; none may be skipped. Walk one: set → typewriter → `PF.update` → `PF.drawTyped`.
- Each draw call uses the right role: HUD/labels `{{hudFont}}`, messages/menus `{{font}}`.
- Check the longest HUD string fits its slot (small: 4–5 px per letter).

**Acceptance checks** (screenshots if you can)
1. All text is the new font with hard edges and a 1 px shadow, at 1× and zoomed.
2. HUD numbers stay aligned while changing; no text overlaps or runs past a window or the canvas.
3. A message types out, pauses after full stops, shows ▼ when done; confirm completes it first.
4. `?t=<ms>&freeze=1` gives the same frame each time (a message set before t is visible); `?auto=1` runs to the end with no console errors.
