# Add paper doll to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `paper-doll.js` (one global, `GameDNA_PaperDoll`), API reference `paper-doll.README.md`

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Paper doll [actor].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Paper doll:** a camera offset; a fixed update step (also the ?t= fast-forward) for update(dt); a key / button to open the wardrobe and the game paused while it is open.

## Element 1: Paper doll (`paper-doll.js`, `GameDNA_PaperDoll`)

Paper doll: the hero drawn from swappable pixel parts with tints on one shared rig (4 directions, 4-frame walk, 3-frame attack, jump); the weapon stays in the right hand when it turns; a wardrobe window (keys, mouse, touch) with a turning preview.

**Parameters chosen:** `stride` = 5, `sparkleMs` = 520, `shadow` = on, `wardrobeKey` = C.

**Where it goes** (by role; find these places in my game):

1. *Once, when the game starts:* `doll = GameDNA_PaperDoll.create({look, params: {stride: 5}})`; `wr = GameDNA_PaperDoll.wardrobe({doll, view: {x: 0, y: 0, w: VIEW_W, h: VIEW_H}})` (view >= 192 x 135 native px). Keep both across restarts.
2. *Every place the hero sprite was drawn (map, title, battle):* `doll.draw(ctx, boxCentreX - camX, boxBottom - camY (+ the old sprite offset), {dir, moving, walk, attack: progress or null, air, scale, alpha})`; skip the old weapon sprite; never `scale(-1, 1)`.
3. *The fixed step (also the ?t= replay):* `doll.update(dt); wr.update(dt);` then if `wr.isOpen()` skip the world / player / enemy update (modal).
4. *Input:* while open every key first to `wr.input(up|down|left|right|ok|back)`, taps to `wr.pointer(x, y)`; `C` (and a HUD button) opens it when the hero is free; autoplay never opens it.
5. *Render:* `wr.draw(ctx)` last, over the world and HUD. Save `doll.look()` with the game.

**Common mistakes** (symptom -> fix):

- Sword switches hands when turning -> the doll is drawn mirrored: pass `dir: 'left'`.
- Hero hovers / sinks -> feetY is not the old sprite's feet (box bottom + sprite offset, after the camera).
- Frozen windup pose -> `attack: 0` passed when idle; use `null`.
- Hero slides -> `walk` missing or not growing while moving.
- Wardrobe invisible -> `wr.update` not in the step (it fades in with update) or drawn before the world.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Paper doll] Walking in four directions shows a 4-step walk; facing left the weapon is behind the body in the right hand.
- [Paper doll] The attack shows windup, strike, follow-through with the weapon in hand; the game's hits are unchanged.
- [Paper doll] The wardrobe opens with the key, changes show on the preview and the hero, the game is paused meanwhile, Z / X close it.
- [Paper doll] `?auto=1` reaches the same end as before with no console errors.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `paper-doll.js` sha256 `9a8c6b48b20edd03...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Paper doll] One worked example of feetX / feetY through the hero box, the camera and the old sprite offset.
- [Paper doll] Every old hero draw call replaced; every key reaches `wr.input` first while open.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.
