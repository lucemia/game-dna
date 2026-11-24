Defaults: `{{preset}}` = tight (tight / floaty / heavy / raw), `{{dash}}` = eight (eight / four / off), `{{wall}}` = on (on / off), `{{coyoteMs}}` = 100, `{{bufferMs}}` = 120, `{{corner}}` = 4

---

Replace the hero's movement in my side-view game with the **platformer feel** module (acceleration curves, variable jump, coyote time, jump buffer, apex hang, terminal fall, dash, wall jump, one-way platforms, corner correction, sub-pixel positions on whole pixels). Use the given `platformer-feel.js` (global `GameDNA_Platformer`, API in its README). It owns the hero's movement and tile collision only; my game keeps sprites, enemies, hazards, camera, HUD, levels and rules.

**Rules.** Include the module verbatim in its own `<script>` before the game script. Never delete or rename my functions or fields. Keep every control, the autopilot (`?auto=1` must still finish), `?t=<ms>&freeze=1`, restart, touch and every level beatable.

**Integration points (find them by role):**

1. **Create once, after the level exists:** `pf = GameDNA_Platformer.create({tile, body: {w, h}, x, y, preset: '{{preset}}', tileAt, params})`.
   - `tileAt(tx, ty)` returns `'solid'` for my wall/ground tiles, `'oneway'` for platforms you stand on from above, else `null`. Copy my old collision test's answer outside the map (side walls solid, below the map empty).
   - `body` = my hero's hitbox size; `x, y` = its top-left, world px.
   - `params`: `{dash: '{{dash}}', wall: '{{wall}}', coyoteMs: {{coyoteMs}}, bufferMs: {{bufferMs}}, corner: {{corner}}}` plus **my old numbers converted** so the levels stay beatable: per-frame px x 60 = px/s (`runSpeed`); old jump height = v² / (2g) in px/frame units (`jumpHeight`, keep it at least as high as before); `maxFall` = old cap x 60.
2. **The fixed update step** (the one `?t=` and autopilot run): where the old hero movement was, `pf.setInput({left, right, up, down, jump: <jump held>, jumpPressed: <jump pressed since last step>, dash: <dash held>, dashPressed})` then `pf.update()`. Use my game's own input object (autopilot and touch included). Then copy back: `hero.x = pf.x; hero.y = pf.y; hero.onGround = pf.onGround; hero.facing = pf.facing`, and velocities in my units (`pf.vx / 60`). Delete nothing else from the hero update (attacks, timers, invulnerability, falling-out checks stay).
3. **Dash key:** an unused key (check every binding; e.g. C or Shift); add it to my help text.
4. **Every place that moves the hero directly:** knockback -> `pf.knock(vx, vy, ms)` (px/s); respawn, checkpoint, level start, restart -> `pf.reset(x, y)`; a bounce off an enemy -> `pf.bounce()`.
5. **Draw:** my sprite at `pf.x, pf.y` (whole pixels; frame from `pf.pose`); optionally `pf.drawFx(ctx, camX, camY)` after the sprites. Enemies keep their own movement.

**Self-check without a browser** (report each):
1. The module is byte-identical; `node --check` each script; every name used in `create` exists at that point.
2. Every reader of the synced hero fields (camera, enemies, pickups, checkpoints, autopilot, debug hook) gets valid numbers each step.
3. Trace `?auto=1`: the autopilot's jump press reaches `jumpPressed`, a held jump reaches `jump`; its pit and wall jumps still clear the gaps with the new `jumpHeight` and `runSpeed` (do the arithmetic: airtime x run speed > widest gap).
4. Worked example: `jumpHeight` 44, `jumpApexMs` 330 -> gravity = 2 x 44 / 0.33² = 808 px/s², take-off 267 px/s.
5. Nothing else writes `hero.x/y` after `pf.update()` except through `pf.reset`/`teleport`.

**Acceptance** (screenshots if you can):
- Hold jump: high arc; tap: short hop; a late jump off a ledge and an early press before landing both jump.
- Dash in 8 directions once per landing; wall slide and kick off; a jump into a ceiling corner slides around it.
- `?auto=1` reaches the same ending as before; no console errors; no scroll at 500 px.
