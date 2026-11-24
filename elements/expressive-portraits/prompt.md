# Add expressive character portraits to my game

Defaults (change any of these before pasting):
`{{size}}` = 48 · `{{layout}}` = left · `{{frame}}` = window · `{{enter}}` = slide · `{{enterMs}}` = 160 · `{{listener}}` = dim · `{{blinkMs}}` = 3600 · `{{mouthMs}}` = 90 · `{{outline}}` = ink · `{{backdrop}}` = tint

---

You are given `expressive-portraits.js`, a finished module, and its `README.md`. **Include it verbatim** (`<script src>` before the game script, or pasted unchanged into its own `<script>`); never rewrite it. It defines `GameDNA_Portraits`: 16-bit bust portraits with 7 expressions, blinking and a talking mouth, beside my game's dialogue box (`GameDNA_DialogueBox`) or in my menus.

Add code; never remove or rename functions.

**First, read my game** and note: the dialogue box's `create(...)` call and its `bounds`; every `dlg.update(`, `dlg.draw(`, `dlg.clear(`; every place that builds dialogue lines and who speaks them; the fixed step and its loops (animation, `?t=&freeze=1`, autoplay); HUD rects; any status / party / select screen; names already used at top level.

**Integration points**

1. **Load** the module before the game script.
2. **Cast**: one spec per speaking character, keyed by the lines' `speaker` (or `who`): `{ seed: <fixed number>, name, age: child|young|adult|elder, gender: female|male|any, skin, hair, hairColor, headgear, collar, cloth, bg }` (only `seed` required; options in the README). Fit each to the character's role; vary ages and skin tones.
3. **Create** before the dialogue box, with a NEW constant name for the field (check it is unused):
```js
const TALK_FIELD = <the box's old bounds>;
const por = GameDNA_Portraits.create({ bounds: TALK_FIELD, uiRects: () => [ /* HUD, menus */ ], cast: { /* step 2 */ },
  params: { size: {{size}}, layout: '{{layout}}', frame: '{{frame}}', enter: '{{enter}}', enterMs: {{enterMs}}, listener: '{{listener}}', blinkMs: {{blinkMs}}, mouthMs: {{mouthMs}}, outline: '{{outline}}', backdrop: '{{backdrop}}' } });
```
4. **Hook the box** (keep all its other options): `bounds: () => por.reserve(TALK_FIELD)`, `onLine: (line, i, ctl) => por.onLine(line, i, ctl)` (if it already has a create-level `onLine`, call both; a per-`open()` `onLine` stays as is). After it: `por.attach(dlg);`
5. **Expressions**: give lines an `expr` that fits the words: `neutral`, `happy`, `angry`, `sad`, `surprised`, `determined`, `hurt`. If lines are built from strings, add a small lookup; never change the text.
6. **Clock**: `por.update(<step ms>)` next to EVERY `dlg.update(` (also the busy branch). **Draw**: `por.draw(ctx)` right after every `dlg.draw(ctx)`. **Reset**: `por.clear()` next to every `dlg.clear()`.
7. **Menus** (only if my game has a status / party / select screen): `GameDNA_Portraits.drawPanel(ctx, por.portrait('<key>'), {x, y}, { expr, t: <frame count> * 1000 / 60 })` where the character is shown; never wall time.

**Autoplay and keys**: the module never reads input or pauses anything; `?auto=1` must end exactly as before.

**Self-check without a browser**
- Module byte-identical, loaded before the game script.
- Every top-level identifier you added is new (grep it).
- `por.update(` beside each `dlg.update(`, `por.draw(` beside each `dlg.draw(`, `por.clear(` beside each `dlg.clear(`.
- Each speaker that should have a face has a cast key matching `speaker`/`who` (case does not matter); every `expr` is one of the seven names.
- Walk one line: `open` → `onLine` sets the face and reserves a column → box beside the panel → typing: mouth moves → close: panel slides out.

**Acceptance checks**
1. When a character talks, their portrait sits beside the box in a frame, never over the text, the HUD or menus; the box is narrowed so it starts beside the panel.
2. The expression changes with the line; the mouth moves while letters type and stops at the end of the page; the face blinks.
3. `?t=<ms>&freeze=1` is identical twice; `?auto=1` ends as before, no console errors.
