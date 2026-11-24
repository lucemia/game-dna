Defaults: {{targets}} = the player character (plus any ally or foe a pack character fits) · {{light}} = left

Replace characters in my game with painted cut-out characters moved by a bone rig. Files: `cutout-characters.js` (global `GameDNA_Cutout`; README has the API) and the pack: `pack.js`, `pack.json`, `chars/sword.webp`, `chars/spear.webp`, `chars/mage.webp`. Include `cutout-characters.js` and `pack.js` verbatim.

**1. Read the game.** The boot (first step, `?t=` fast-forward, first frame) and every caller; the fixed step; restart; the draw function of {{targets}}: feet point, height, facing, and every state it shows (run, jump, attack timer and length, hurt timer, blink, hit flash, death).

**2. Cast.** `sword` (swordswoman, buckler), `spear` (two-handed spear), `mage` (staff, casts). One per game character, by weapon and role; never one picture as two characters at once. Unfitted characters keep their old drawing.

**3. Load once.** `const CUT = GameDNA_Cutout.load(window.GameDNA_CutoutPack, {base: ''})` and one `CUT.actor(id, {h})` per replaced character, at load time. Replace the old boot call with `CUT.onReady(boot)` (old start code, unchanged).

**4. Map states in the fixed step** (never in draw): hurt timer -> `actor.pose('hurt', 1 - left / total)`; attack timer -> `actor.pose('slash', elapsed / total)` (side view: the tip lands 0.63-0.7 h ahead of the feet from k 0.22; `'attack'` = overhead chop, `'cast'` = magic); airborne -> `pose('jump', vy < 0 ? 0.2 : 0.8)`; otherwise `pose(null)` + `loop('walk' | 'idle', {speed: |vx| / (CUT.walkSpeed(id) * h)})`. Then `actor.update(1000 / 60, {vx: <speed per second>, h, facing})`. Restart: `actor.reset()`. No timer: `actor.play('hurt', {dur})`.

**5. Draw.** Where the character was drawn: `if (!actor.draw(ctx, feetX, feetY, {h, facing, flash: 'auto', alpha, light: '{{light}}', shadow: onGround, swoosh: true})) <old drawing>`. `h` = the old sprite's height (head top slightly above the hit box); `facing` -1 flips; `flash: 'auto'` = a short crisp flash at each hurt; `alpha` for blinking; `swoosh` draws the blade's arc. Drop the old body, weapon and swing line (the rig animates its own weapon); keep effects, hit boxes and rules.

**Regenerate (no images given).** Use `TEMPLATES.md`, `style-lock.txt`, `rig-config.json` (example), `tools/`.
- Images only from your built-in image_gen, one per call, `transparent_background: true`; scripts only cut, clean alpha, scale and pack. Every prompt ends with the STYLE LOCK paragraph; no real names; run `python3 tools/namecheck.py --require-guard <prompt>` first.
- Derive the cast from the game's theme and palette; vary class, hair, build and colours (TEMPLATES §1). Per character: (a) a full body (§1; later ones pass the first's path in `referenced_image_paths`); (b) a parts sheet from §2 with ONLY that full body as reference. Save images unchanged in `art/gen/<run>/` with a GEN.md (exact prompt, references, tool output). Regenerate a sheet whose pieces touch, bend or are missing.
- `python tools/make-pack.py --list <sheet>`, write `art/rig-config.json` (piece order, z, `role` sword | spear | mage, pivot / joint fractions from TEMPLATES §3), then `python tools/make-pack.py art/rig-config.json --out art/cutout --overlay art/check`. Check large rest / attack poses, both elbows (the far one first); add overlap (§3) until no joint shows a gap. Use `./.venv/bin/python` if `uv` fails.
- Wire it in as in steps 1-5 with your pack.

**Self-check without a browser.**
- Boot, `requestAnimationFrame` and the `?t=` loop run once, from `onReady`; `?t=<ms>&freeze=1` is deterministic; `?auto=1` ends exactly as before.
- Each `.draw(` sits in `if (!...)` with the old drawing; `pose(` / `loop(` / `play(` / `update(` only in the step.
- No rule, timer or hit box changed.

The art is original, no resemblance to any existing game, film or franchise character, no text, no logo, no watermark. Finish with CHANGES.md: who got which character, the state mapping, a `?t=` moment showing an attack.
