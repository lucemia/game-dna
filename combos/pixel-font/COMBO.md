# Add pixel bitmap font to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `pixel-font.js` (one global, `GameDNA_PixelFont`), API reference `pixel-font.README.md`

README example names are placeholders.

## Shared premises

1. **Include each module file verbatim; never edit it.** Load it with its own `<script src>` before the game's script, or paste it unchanged into its own `<script>` tag. If a module seems to need a change, adapt my game around it and tell me.
2. **Resolution:** keep my game's native resolution and integer scaling as they are. Call module draw functions on my 2D context inside the same transform as my sprites (one module pixel = one game pixel), and keep my game's own image-smoothing setting (off for pixel art, on for smooth or HD games; never switch it).
3. **Time:** drive every module from one fixed 60 Hz step (1000 / 60 ms). If my loop uses variable delta time, accumulate it and run whole steps (at most 250 ms per frame).
4. **Coordinates:** native screen pixels (world minus camera) unless a section says tiles.
5. **Art and names:** anything new you draw or name is original (no real game, character, place or brand names); English UI text; do not restyle my game.
6. **Hook, don't replace:** add calls or change bodies; never delete or rename a function.
7. **Keep every other caller working.** Find every caller and reader of what you change (turn order, input, moves, menus, HUD): autopilot/AI, test hooks, URL parameters such as `?auto=1`, `?t=` and `?freeze=1`, keyboard shortcuts, end-turn buttons. Update each one. My game's own autoplay must still finish a whole game. Keep existing HUD info (HP bars, max HP) and existing commands.

## Order of work

1. **Read the game first.** Write down (file, function) where these live: loop/update step; draw pass and its order (background, actors, effects, HUD); input; where damage/HP changes are applied; where turns, actions or selections are chosen and played; HUD windows and their rects; camera; battle/scene start and end; and every caller from premise 7.
2. **Check the prerequisites** below against those notes. If one is missing, add the smallest working version and tell me.
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Pixel bitmap font [ui].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Pixel bitmap font:** the game's text draw calls (fillText or a bitmap-text helper) and width helpers; a fixed 60 Hz update step; optional: the places where a message, caption or dialogue line is set, and the confirm key that advances it.

## Element 1: Pixel bitmap font (`pixel-font.js`, `GameDNA_PixelFont`)

Every letter on the canvas is drawn from an original 1-bit bitmap font (6x8 proportional `regular`, fixed-advance `mono`, 5x7 `small`; full printable ASCII) at whole pixels, so text is as crisp as the sprites at any integer scale. Strings carry inline colour codes (`HP {gold}120{/}/150`); drop shadow, outline or both; word wrap; fit-to-slot. Messages, captions and dialogue type out letter by letter with pauses after full stops, a blip callback and a ▼ when done.

**Parameters chosen:** `font` = regular, `hudFont` = small, `scale` = 1, `shadow` = drop, `color` = white, `cps` = 40, `blipEvery` = 2, `pause` = 160.

**Where it goes** (by role; find these places in my game):

1. *Once, after the canvas context exists:* `PF = GameDNA_PixelFont.create({params: {font: 'regular', scale: 1, shadow: 'drop', color: 'white', cps: 40, blipEvery: 2, pause: 160}, onBlip})`. `onBlip(ch)` plays the game's blip sound if it has one; leave it out otherwise.
2. *Every text draw call and text helper (grep `fillText`, `strokeText`, `measureText`, `ctx.font`, bitmap-text and width helpers):* Keep each helper's name, parameters and return value; its body becomes `PF.draw(ctx, str, x, y, {color, align, scale, font})`, its width helper `PF.measure(str, {font, scale})`. A bare `ctx.fillText(s, x, y)` becomes `PF.fillText(ctx, s, x, y)` (reads fillStyle, textAlign, textBaseline, px size). Font roles: HUD values and short labels (HP, MP, lives, score, timers, names in status rows) use `font: 'small'`; messages, captions, dialogue, menus and titles use `regular`.
3. *Every layout that depends on a text width (right-aligned numbers, centred titles, menu columns, boxes sized around text):* Use `PF.measure`; then check each row still fits its window and the canvas (use `small` or `fit: <px>` where tight). Never drop information to make room.
4. *Every place a message, caption, banner subtitle, action name or dialogue line is SET (inside the update step); every such text, even a short passing one, must type out; only static HUD values/labels, menus and titles draw at once:* `PF.typewriter(id, text, {width, restart: true})`; where it was drawn: `PF.drawTyped(ctx, id, x, y, {cursor: true})`. If a confirm key already advances messages: `if (!PF.skip(id)) return;` first. Add no new key handlers.
5. *Your fixed update step (the one `?t=` / autoplay replays run):* `PF.update(stepMs)` once per step.
6. *Canvas CSS:* If the canvas is CSS-scaled, add `image-rendering: pixelated` (CSS only).

**Common mistakes** (symptom -> fix):

- Text blurry or strokes uneven -> fractional CSS zoom without `image-rendering: pixelated`, or a non-integer `ctx.scale`.
- HUD values run into the next column -> widths were hard-coded for the old font; measure everything with `PF.measure`, use the small font or `fit`.
- Message empty in `?t=&freeze=1` shots -> `typewriter` was only called from the draw pass; call it where the text is set, inside the step.
- A repeated identical message shows instantly -> pass `restart: true` at the set site.
- Text never appears -> `PF.update` is never called in the step.
- First confirm press skips the whole message -> call `PF.skip(id)` before the advance code.
- A system font is still visible on the title or game-over screen -> a `fillText` call was missed; grep again.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Pixel bitmap font] All text uses the bitmap font with hard edges and a 1 px shadow, at 1x and zoomed; no `fillText` text left.
- [Pixel bitmap font] No text overlaps other text, runs past its window or the canvas; HUD numbers stay aligned while they change.
- [Pixel bitmap font] Every message, caption and action name types out letter by letter, pauses after full stops, shows ▼ when complete; confirm completes it first.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `pixel-font.js` sha256 `ba7c0476e58d0f03...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Pixel bitmap font] List every former text call site and what draws it now; each helper keeps its name, parameters and return value.
- [Pixel bitmap font] List every set site of message, caption, action-name and dialogue text with its `PF.typewriter(..., {restart: true})` call; none skipped. Walk one: set -> typewriter -> `PF.update` -> `PF.drawTyped`.
- [Pixel bitmap font] Each draw call uses the right role: HUD/labels `small`, messages/menus `regular`.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.
