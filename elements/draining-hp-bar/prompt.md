# Add draining HP bars to my game

Defaults (change any before pasting):
`{{hold}}` = 450 · `{{holdCap}}` = 1600 · `{{drain}}` = 0.7 · `{{ease}}` = smooth · `{{gainHold}}` = 240 · `{{low}}` = 0.25 · `{{theme}}` = auto · `{{render}}` = auto

---

You are given `draining-hp-bar.js` (finished module, global `GameDNA_DrainingHpBar`) and its `README.md`. **Include the module verbatim** (`<script src>` before my game script, or pasted unchanged into its own `<script>`); never edit it. It only draws; it never changes game state.

What the player sees: a hit drops the fill at once while a pale loss segment holds, then drains; quick hits merge. A heal shows a mint gain segment first, then the fill rises. Low HP pulses.

Add code; never delete or rename my functions, state fields, URL parameters or keys.

**Integration points** (find these places in my game):

1. **Create one instance** at startup:
`hpBars = GameDNA_DrainingHpBar.create({ params: { hold: {{hold}}, holdCap: {{holdCap}}, drain: {{drain}}, ease: '{{ease}}', gainHold: {{gainHold}}, low: {{low}}, theme: '{{theme}}', render: '{{render}}' } })`
2. **Feed HP every fixed step**: for every unit that has a health bar (player, party, enemies, boss), `hpBars.set(id, hp, maxHp)` with a stable id per unit, then `hpBars.update(stepMs)`. Run this in every scene, menus open included. Do not hunt for damage code: the module sees drops and rises itself.
3. **Snap without animation** where units are created or refilled: new game, new battle or wave, respawn, restart: `hpBars.reset(id, hp, maxHp)`.
4. **Draw** each bar where my game draws its HP bar now, at the same rect, replacing only the bar's background and fill rectangles (keep HP numbers, names, frames, MP bars):
   - boss or big enemy bar: `hpBars.draw(ctx, id, x, y, w, h, { style: 'boss', label: name })`;
   - player / party HUD bars: `{ style: 'party', team: 'ally' }`;
   - small bars over units, inside the camera transform (world space): `{ style: 'unit', team: 'foe' }`; they hide by themselves when full.
   - **After a unit dies or is removed, keep calling `set` and `draw` for its bar (at its last position) while `hpBars.busy(id)` is true**, or the killing blow never shows its loss segment.
   `x, y, w, h` = the inner bar rect in the coordinates of the code that draws it. If my game eases its own "displayed HP", keep that variable but draw from the module.
   Keep my HP numbers; `opts.text: 'hp/max'` is only for bars without text.

**Keep every other caller working**: autoplay (`?auto=1` must end exactly like before), `?t=&freeze=1` stills, restart, pause, all keys and taps.

**Self-check without a browser**
- The module file is byte-identical to the one given.
- `hpBars` exists before the first `set`, `update` or `draw` (also in a fast-forward loop).
- Every drawn id gets `set` every step; ids are unique and stable (e.g. wave number plus enemy index).
- `reset` runs on new game, new wave or battle and respawn.
- Walk one hit: HP 100 -> 60, the fill drops to 60 %, the pale part covers 60-100 % and drains after {{hold}} ms.

**Acceptance checks** (screenshots if you can)
1. A hit: the fill drops at once, a pale segment holds and then drains.
2. Three quick hits: one merged segment, one drain.
3. A heal: a mint segment appears first, then the fill rises.
4. At or below {{low}} of max HP the bar pulses; a killed unit's bar drains before it disappears.
5. Over-head bars follow their unit while the camera moves.
6. `?auto=1` plays to the end with no console errors and the same result.
