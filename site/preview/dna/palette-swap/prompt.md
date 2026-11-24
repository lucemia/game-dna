# Add Palette-swap variants to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `palette-swap.js` (one global, `GameDNA_PaletteSwap`), API reference `palette-swap.README.md`

README example names are placeholders.

## Where it goes in my game (my choice; follow it exactly)

- **Palette-swap variants:** Use the palette variants exactly for: units: team colour per side (player blue, enemy red); a unit that has already acted this turn: greyed; units below a quarter of their HP: low-HP pulse. Do not recolour anything else.

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Palette-swap variants [effects].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Palette-swap variants:** the sprite the game already draws, as a long-lived canvas, loaded image or palette-indexed string sprite {rows, pal}; state that names the look: side or team, acted flag, elite flag, status, HP; the draw call of each sprite (the image argument is swapped); a fixed 60 Hz update step (optional).

## Element 1: Palette-swap variants (`palette-swap.js`, `GameDNA_PaletteSwap`)

Recoloured variants of sprites the game already has, with no new art: the module finds each sprite's colour ramps and maps them dark-to-light onto new ramps (team blue / red / green / yellow, elite, rare), or tints the whole sprite (poison, petrify, frozen, a pulsing low-HP red, a greyed "already acted" look). Names combine with `+` (`team-red+spent`). Each (sprite, variant) is built once and cached; the game only swaps the image argument of its existing draw call.

**Use the palette variants exactly for: units: team colour per side (player blue, enemy red); a unit that has already acted this turn: greyed; units below a quarter of their HP: low-HP pulse. Do not recolour anything else.**

**Parameters chosen:** `hueTol` = 24, `protectSkin` = auto, `target` = primary, `strength` = 0.6, `pulseHz` = 2, `pulseSteps` = 4, `spentDim` = 0.6, `keepOutline` = on, `elite` = violet, `eliteEdge` = on.

**Where it goes** (by role; find these places in my game):

1. *Once, after the sprites are baked (canvases, loaded images, or `{rows, pal}` string sprites):* `PS = GameDNA_PaletteSwap.create({params: {hueTol: 24, protectSkin: 'auto', target: 'primary', strength: 0.6, pulseHz: 2, pulseSteps: 4, spentDim: 0.6, keepOutline: 'on', elite: 'violet', eliteEdge: 'on'}})`.
2. *One name function next to the sprite drawing:* Derive the look from state the game already has, e.g. `looks(u)` → `team-blue` / `team-red`, `+spent` when it has acted during the current phase of its own side, `+poison` while poisoned, `+lowhp` below a quarter HP, `elite` for elites. For `spent`, reuse the game's own done/acted flag and its own guard (e.g. only while the player phase runs); a flag you add is cleared for a side where that side's phase ENDS (where the game resets its per-turn flags), never later. For other missing looks add a plain visual flag that no rule reads (set where the state begins, cleared where it ends); never call the game's RNG for it. Let detection pick the ramps: no `setRamps` unless a sprite visibly fails.
3. *Every draw site of those sprites (map, battle, menus, portraits, death fade, mirrored foes). Grep every `drawImage` of them:* Change only the image argument: `drawImage(PS.variant(sprite, looks(u)), ...)`, the same variant in every pass that redraws the sprite (normal and additive hit-flash overlay). Keep transforms, flips, alpha and composite modes. Stop drawing the game's own pre-baked art for a look you replaced (its grey "acted" sprite); keep pure white flash frames.
4. *Your fixed update step (the one the animation loop, the `?t=&freeze=1` fast-forward and autoplay all call):* `PS.update(1000 / 60)` once per step (the low-HP pulse clock).

**Common mistakes** (symptom -> fix):

- Nothing changes colour and the console says "unknown variant" -> the name is not in the list (or has a typo); use a listed name or `define()` it first.
- Frame rate drops and the console warns about many new sprite objects -> a canvas is made inside the draw function and passed in; pass the baked sprite object.
- The variant shows stale pixels after the game repaints a sprite canvas -> `PS.invalidate(sprite)` after the repaint.
- Faces or hands take the team colour -> set `protectSkin: 'on'`, or `PS.setRamps(sprite, {primary: [cloth colours dark -> light]})`.
- Only part of a garment changes -> its shading is hue-shifted more than `hueTol`; raise it or list the ramp with `setRamps`.
- The low-HP pulse never moves, or frozen frames differ -> `update()` is not in the fixed step.
- The white hit flash turned into a coloured flash -> the variant was applied to the game's pure white flash frame; keep that frame as it was.
- The hit flash blends the old colours over the team colour -> an overlay pass still redraws the base sprite; give it the same variant.
- Enemies stay grey through the whole player phase -> an added acted flag is cleared when the enemy phase begins again; clear it where that side's phase ends (where the game resets its own per-turn flags), or reuse the game's flag and guard.
- Part of a garment keeps its old colour (a hood stays green) -> `setRamps` listed only some colours; drop it and let detection pick the ramps.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Palette-swap variants] units: team colour per side (player blue, enemy red); a unit that has already acted this turn: greyed; units below a quarter of their HP: low-HP pulse: each named look is visible on the right sprites and nothing else changed colour; faces and outlines keep their colours.
- [Palette-swap variants] A look changes on the frame its state changes (acting, a status starting or ending, HP crossing the threshold) and goes back when it ends; the low-HP pulse breathes.
- [Palette-swap variants] Walk a turn: during the player phase no enemy is `spent`, during the enemy phase no player unit is, and the next turn starts with nobody spent.
- [Palette-swap variants] `?t=<ms>&freeze=1` gives the same frame every time; `?auto=1` ends exactly as before, no console errors or warnings.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `palette-swap.js` sha256 `8badcf8365e792cf...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Palette-swap variants] Grep `variant(`: only in draw code, as the image argument, at every draw site of the affected sprites; its first argument is a long-lived sprite object.
- [Palette-swap variants] Every name is from the list (`base`, `team-blue|red|green|yellow`, `elite`, `rare`, `poison`, `petrify`, `frozen`, `lowhp`, `spent`, joined with `+`); flags you added are read only by the name function.
- [Palette-swap variants] Grep `update(`: once per fixed step. No rule, timer or RNG call changed.
- [Palette-swap variants] Walk one case: an enemy that has acted -> `variant(sprite, 'team-red+spent')` -> its clothing ramp turns red, then all but the outline greys at 0.6 brightness.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.
