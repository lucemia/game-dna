# Add a typewriter dialogue box to my game

**Required:** `{{scope}}` = which text goes in the box, in your words (e.g. "everything the game already shows in its message box: talking, signs, chests").
Defaults:
`{{speed}}` = 40 · `{{pause}}` = 160 · `{{rows}}` = 3 · `{{place}}` = auto · `{{nameTag}}` = on · `{{autoAdvance}}` = 0 · `{{hold}}` = on · `{{tint}}` = a · `{{dim}}` = 0

---

You are given `dialogue-box.js`, a finished module, and its `README.md`. **Include the module verbatim** (`<script src>` before the game script, or pasted unchanged); never rewrite it. It defines `GameDNA_DialogueBox`.

**Use the box for exactly: {{scope}}.** Only text the player reads and dismisses (talk, signs, item/chest messages, story beats). Leave self-clearing captions, combat logs, banners and the game's own result overlays (VICTORY, GAME OVER) as they are.

Add code; never remove or rename functions.

**First, read my game**: the fixed step and its loops (animation, `?t=&freeze=1`, autoplay); confirm input; the draw pass; HUD rects; the text function and **every caller**; what runs after a text closes; the old dialog state; restart.

**Integration points**

1. **Load** the module before the game script.
2. **Create one instance** once the screen size is known:
```js
const dlg = GameDNA_DialogueBox.create({
  bounds: { x: 0, y: <field top>, w: <screen width>, h: <field height> },
  params: { speed: {{speed}}, pause: {{pause}}, rows: {{rows}}, place: '{{place}}', nameTag: '{{nameTag}}', autoAdvance: {{autoAdvance}}, hold: '{{hold}}', tint: '{{tint}}', dim: {{dim}} },
  autoplay: () => <the game's autoplay flag>,
  getAnchor: (who, line) => <that character's sprite rect {x, y, w, h} on screen now, or null>,
  uiRects: () => [ /* HUD, menus, minimap */ ],
  onTick: ch => { /* the game's text blip, or nothing */ }
});
```
3. **Open** in the game's existing text function (same name and arguments): `dlg.open(lines, { onEnd: r => { ... } })`, where `lines` = `[{speaker: 'Elder', who: '<sprite id>', text: '...'}, {text: 'narration'}]`. Keep the old dialog state set while open; move what ran after the old text closed into `onEnd` and clear the state there.
4. **Route input and pause**: top of the fixed step: `if (dlg.busy()) { if (<confirm pressed this step>) dlg.press(); dlg.hold(<confirm held>); dlg.update(<step ms>); return; }`. Otherwise `dlg.update(<step ms>)` at the end of the step. **The step that calls `open()` still runs the rest of its world update** (other units, timers, encounters); the gate starts next step, else later events and autoplay shift. Old box closed on Back? `dlg.end()` there. Pause/restart keys stay outside.
5. **Draw**: `dlg.draw(ctx)` last, after the HUD, outside any shake translate. Delete only the old box drawing.
6. **Reset**: `dlg.clear()` at new game / restart / scene change.

**Lines**: short English sentences, original names; narration and system text have no `speaker` (no name plate; never invent one); `{gold}word{/}` highlights.

**Autoplay must end as before** (pages advance by themselves).

**Self-check without a browser**
- Module byte-identical; `open(` only in the text function (update logic), reached by every caller.
- `update(` every fixed step, also while busy; the freeze loop calls that step.
- The old dialog flag is true while the box is open; the after-text code runs in `onEnd`.
- Walk one autoplay line (40 letters): open 0.1 s → ~1 s typing → 0.6 s → close → `onEnd`.

**Acceptance checks**
1. {{scope}} types out in the box; Z / Enter / tap finishes, then advances; captions, banners and result overlays look as before.
2. The box never covers the speaker or HUD; holding Z fast-forwards.
3. `?t=<ms>&freeze=1` is deterministic; `?auto=1` ends as before with no console errors.
