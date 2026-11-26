# demo-mix: three elements stacked in one game (showcase demo)

A showcase demo, not a cold test: the unseen battle host (`hosts-unseen/battle`, "Caravan Ambush") with three compatible
elements integrated by following the merged `COMBO.md` (made by `node tools/combine.mjs damage-pop hit-stop-shake hit-sparks`):

- **damage-pop** (C-11 modern damage numbers): `damage-pop.js`
- **hit-stop-shake** (E-05 hit-stop, shake & flash): `hit-stop-shake.js`
- **hit-sparks** (hit sparks & spell bursts): `hit-sparks.js`

The module files are byte-identical to the ones `combine.mjs` wrote (sha256 in `COMBO.md`). Everything else is the host's own code
plus the wiring: one hit-stop gate (`juice.step`) at the top of the fixed step, every HP/MP change spawning its number, one
`juice.hit` and one `fx.hit` / `fx.burst` per accepted hit, draw order field -> sprites -> sparks -> numbers -> `juice.end/draw` -> HUD.

- `?mix=dp,hs,fx` (default all three) turns elements on one at a time for the promo video's "Mix them" shot (`?mix=none` is the host as shipped).
- Works with the host's `?t=<ms>&freeze=1` and `?auto=1`.
- judge/run.py (`--module-ref combos/demo-mix`, original.html = the host): 0 page errors, autoplay ends the same as the original,
  manual session OK, no overflow at 500 px, modules unchanged (2026-11-26).

All art is the host's code-drawn pixel art; no AI-generated images.
