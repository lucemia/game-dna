# Add Keyword tooltips to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `keyword-tooltips.js` (one global, `GameDNA_KeywordTooltips`), API reference `keyword-tooltips.README.md`

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Keyword tooltips [ui].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Keyword tooltips:** the game's canvas and the coordinate space of its draw calls (view); keyword definitions {title, kind, icon, color, text} written from the game's rules; [id] references between them; a fixed 60 Hz update step; rich text placed with text() / setText() where the player reads it; mark() for words or icons the game draws itself; optional uiRects() (HUD) and avoid() (unit boxes) in view units; optional game font {measure, draw, h, lineH}.

## Element 1: Keyword tooltips (`keyword-tooltips.js`, `GameDNA_KeywordTooltips`)

Rules text (descriptions, info lines, log lines) becomes rich text whose keywords (statuses, stats, terrain, rules) are coloured and underlined; a tooltip with icon, title, kind and text opens on mouse hover, touch long-press or tap and keyboard focus (Tab). Keywords inside a tooltip open nested tooltips; click, tap or the pin key pins one. Tooltips stay inside the screen, never cover their word, avoid the HUD and the units when they can, and fade, glide or crossfade (never jump). Words or icons the game draws itself (HP labels, status badges) become keywords too. The game's own font can draw the words.

**Parameters chosen:** `theme` = slate, `delay` = 180, `depth` = 3, `hints` = on.

**Where it goes** (by role; find these places in my game):

1. *Once, after the canvas exists (before the first step):* `tips = GameDNA_KeywordTooltips.create({canvas, view: {w: <native width>, h: <native height>}, keywords: {<id>: {title, kind, icon, color, text: '... [other-id] ...'}}, uiRects: () => [<HUD boxes>], avoid: () => [<living unit boxes>], params: {theme: 'slate', delay: 180, depth: 3, pinKey: 't', hints: 'on'}})`. Write 6-12 keywords from the game's real rules.
2. *The fixed step (the live loop AND the ?t= fast-forward):* `tips.update(STEP_MS)` first.
3. *Where the player reads rules: a description line for the highlighted command / card / item, an info line for the tile or unit under the cursor:* `tips.text(ctx, '<id>', 'Deals 6. Applies 2 [burn].', x, y, {w, font: {pixel: true, h, lineH, space, measure: s => <width>, draw: (c, s, x, y, col) => <the game's text call>}})` in the render; make a strip for it, never inside clickable menu labels.
4. *Where the game draws a stat label or a status icon:* `tips.mark('<id>', '<keyword>', {x, y, w, h})` every frame it is visible.
5. *Every render path, last (title, play, results, early returns):* `tips.draw(ctx)`.

**Common mistakes** (symptom -> fix):

- Nothing opens on hover -> update() is not in the step (stats().noUpdate) or the text is drawn by the game instead of text() / mark().
- Menu rows stop answering taps -> a [keyword] sits inside a clickable label: the module takes presses on keywords.
- Escape / T / Tab do something odd in the game -> those keys are used: set focusKey / pinKey to free keys.
- Plain text where a keyword was meant -> the [id] is not defined (stats().unknown).
- Tooltips land on characters -> avoid() is missing or returns stale boxes.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Keyword tooltips] Hover a keyword: tooltip after the delay, on screen, not over the word; hover a keyword inside it: nested tooltip.
- [Keyword tooltips] Click a keyword: pinned, stays when the pointer leaves; click outside closes. Tab / T / Escape walk the keywords.
- [Keyword tooltips] `?auto=1` ends exactly as before; `?t=&freeze=1` stills render; no page errors.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `keyword-tooltips.js` sha256 `124f0d8e48b45322...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Keyword tooltips] update() in the shared step; draw() last in every render path including early returns.
- [Keyword tooltips] Every [id] defined; texts use the game's real numbers; no host function removed or renamed.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.
