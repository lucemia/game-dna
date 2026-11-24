# Add dissolve-out defeat to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `dissolve-defeat.js` (one global, `GameDNA_DissolveDefeat`), API reference `dissolve-defeat.README.md`

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Dissolve-out defeat [effects].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Dissolve-out defeat:** defeat event on the frame HP reaches 0: {target id, sprite rect on screen now, sprite image or a draw callback}; a world clock in ms that can pause; optional: rectangles to keep clear (banner, HUD, windows).

## Element 1: Dissolve-out defeat (`dissolve-defeat.js`, `GameDNA_DissolveDefeat`)

A defeated unit that leaves the field blinks white, then dissolves from a snapshot of its sprite (dither fade, slice wipe, crumble with gravity, or flash-out) in about 0.5-1 s. The game removes the unit on the defeat frame; nothing waits for the effect.

**Parameters chosen:** `variant` = dither, `duration` = 700, `flash` = 100, `edge` = white, `chunk` = 1, `spill` = 3.

**Where it goes** (by role; find these places in my game):

1. *Once, after the screen size exists and BEFORE any reset code that will call `clear()` first runs:* `dd = GameDNA_DissolveDefeat.create({view: {x: 0, y: 0, w: <field width>, h: <field height above the HUD>}, params: {variant: 'dither', duration: 700, flash: 100, edge: 'white', chunk: 1, spill: 3}, uiRects: () => <rects of banners/windows on screen now>})`.
2. *Every place HP can reach 0 (attacks, spells, counters, poison ticks); ideally the one shared HP function. Grep every write to HP:* Note `wasAlive = hp > 0` before the change; after it, if `wasAlive && hp === 0` and the unit leaves the field: `dd.defeat(unit.id, {rect: {x, y, w, h}, image: <sprite image drawn now>, flipX: <drawn mirrored?>})`. The rect is where that image is drawn this frame (same rounding, hover, bob; no hit shake or lunge). Sprites drawn by code: `drawSprite: ctx => <draw the unit on this ctx at its screen position>` instead of `image`. Units that stay down on the field (revivable heroes) are left alone.
3. *The unit draw code:* Skip dissolved units from the defeat frame on; turn off their built-in death fade/blink (keep its counters if other code reads them).
4. *Your fixed update step, every step (also banners, menus, end screen):* `dd.update(<step in ms>)`; `0` while the world is frozen.
5. *Your draw pass:* `dd.draw(ctx)` after the units, before hit effects, banners and HUD, inside any shake translate.
6. *Where a battle, wave or level STARTS or restarts:* `dd.clear()`.

**Common mistakes** (symptom -> fix):

- The old sprite still fades on top of the dissolve -> the built-in death fade is still drawing; skip the unit in its draw code.
- Dissolve a few px off or mirrored -> the rect/flip must match how the image is drawn this frame.
- Nothing shows and the console says the snapshot is empty -> `drawSprite` drew on the screen context, not on its `ctx` argument.
- The victory screen comes later, or autoplay ends differently -> the end-of-battle check must not wait for the effect.
- Dissolve freezes during banners or the end screen -> `update` runs every step, not only in battle phases.
- "Cannot access before initialization" on load -> a reset function calls `clear()` before the instance is created; create it earlier.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Dissolve-out defeat] A defeated enemy blinks white, then dissolves at its exact spot in about 700 ms; its old sprite and old fade never show alongside.
- [Dissolve-out defeat] Nothing is drawn on neighbours, outside the field or over the HUD; `?auto=1` ends exactly as before, with no console errors.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `dissolve-defeat.js` sha256 `dcd746410957e345...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Dissolve-out defeat] List every HP write that can reach 0 and its `dd.defeat`; trace one kill: HP 0 -> `defeat` with the drawn rect -> unit not drawn -> `update` every step -> `draw` every frame.
- [Dissolve-out defeat] `dd` exists before the first `defeat` or `clear`; the end-of-battle condition and every caller (autoplay, freeze replay, keys, restart) are unchanged.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.
