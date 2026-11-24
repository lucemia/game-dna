# Add branching dialogue choices with flags to my game

**Required:** `{{scope}}` = which talks branch and what the choices change (e.g. "the elder: accept, ask a reward or ask about slimes; the reward gives a potion").
Defaults:
`{{menuPlace}}` = auto · `{{timeout}}` = 0 · `{{wrap}}` = on · `{{disabled}}` = show · `{{tint}}` = a

---

You are given `dialogue-choices.js` with its `README.md` (and `dialogue-box.js` + README if my game has no text box). **Include the modules verbatim** (`<script src>` before the game script, `dialogue-box.js` first); never rewrite them. `GameDNA_DialogueChoices` runs branching talks from a plain script: a 2–4 option menu, flags (`set`, `inc`, conditions like `gold>=10 && !metElder`), `goto` labels, once-only lines, `{$flag}` in text, `validate()`.

**Branch exactly: {{scope}}.** Add code; never remove or rename functions.

**First, read my game** and note: the fixed step and its loops (animation, `?t=&freeze=1`, autoplay); confirm / up / down / back input edges; the draw pass; HUD rects; the text function, **every caller of it** and the old dialog state; save / load; restart.

**Integration points**

1. **Script**: `{name: [entries]}`, neutral English. A question line has `choices`; options `goto` labels and the branches rejoin. Every menu's `default` = the option that keeps today's story (autoplay must end the same). Every flag goes in `flags` with its start value.
2. **Create once** (screen size known): `talk = GameDNA_DialogueChoices.create({ script, flags, bounds: <play field>, params: { menuPlace: '{{menuPlace}}', timeout: {{timeout}}, wrap: '{{wrap}}', disabled: '{{disabled}}', tint: '{{tint}}' }, autoplay: () => <autoplay flag>, uiRects: () => [ /* HUD, menus */ ], onFlag: (name, value) => { /* game changes */ } })` plus EITHER `box: <a GameDNA_DialogueBox instance>` OR `adapter: { show(line, done), close(), rect() }` wired to my own text box (README "Adapter mode"). Run `talk.validate()` once; fix every error, unreachable label and unknown flag.
3. **Start** in the existing talk function (keep its name, arguments and old dialog flag): `talk.start('<name>', { onEnd: r => { <clear the flag>; <what ran after the old talk> } })`.
4. **Input and pause**, at the top of the fixed step: box mode `if (talk.busy()) { up → talk.move(-1); down → talk.move(1); confirm (key-down edge) → talk.press(); back → talk.back(); talk.hold(<confirm held>); talk.update(<step ms>); return; }`, and `talk.update(<step ms>)` at the end of every other step. Adapter mode: the same block but only while `talk.choosing()`, before my box's own input; my box keeps advancing lines and calls `done()`.
5. **Draw** `talk.draw(ctx)` last, after the HUD (box mode: it also draws the box; remove your `dlg.update` / `dlg.draw` / `dlg.press` calls).
6. **Game effects** in `onFlag` / `onEnd` (open a gate, add an item); game code uses `talk.get / set / inc`.
7. **Saves / restart**: save `talk.getFlags()`, load `talk.setFlags(data)`; restart: `talk.clear(); talk.resetFlags();`.

**Self-check without a browser**
- Modules byte-identical, loaded first; `validate()` reports ok.
- `start(` only in update logic; every caller reaches it.
- `update(` every fixed step, also while busy; the freeze loop calls that step.
- While the menu is up, confirm reaches only `talk.press()`.
- Walk one autoplay menu: text done → menu → `default` picked at 600 ms → its `goto` → the same ending.

**Acceptance checks**
1. {{scope}}: the menu opens beside the text box after the question; ↑↓ move the cursor, Z / tap picks; disabled options are grey with a reason; branches rejoin.
2. A flag set by a choice changes a later line and something in the game; the menu never covers the HUD or text box.
3. `?t=<ms>&freeze=1` is deterministic; `?auto=1` ends as before, no errors; save → load keeps the flags.
