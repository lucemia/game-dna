# Add an upgrade draft (pick 1 of 3) to my game

**Required:** `{{when}}` = when the draft opens, in your words (e.g. "at every level-up, instead of the fixed stat bonus").
Defaults:
`{{seed}}` = 1 · `{{choices}}` = 3 · `{{rerolls}}` = 1 · `{{skip}}` = on · `{{wCommon}}` = 60 · `{{wRare}}` = 30 · `{{wEpic}}` = 10 · `{{maxStacks}}` = 5 · `{{look}}` = auto · `{{autoPick}}` = rarest · `{{strip}}` = draft · `{{dim}}` = 0.55

---

You are given `upgrade-draft.js`, a finished module, and its `README.md`. **Include the module verbatim** (`<script src>` or pasted unchanged); never rewrite it. It defines `GameDNA_UpgradeDraft`.

**Open the draft exactly: {{when}}.**

Add code; never remove or rename functions.

**First, read my game** and note: the fixed step and loops (`?t=&freeze=1`, autoplay); key handling; draw pass, canvas transform and HUD; **where that moment happens** and what it did; the stat fields the game really reads; restart; save.

**Integration points**

1. **Load** the module before the game script.
2. **Upgrade table**: 10-16 entries, original neutral-fantasy names, `{id, name, rarity: 'common'|'rare'|'epic', tags, text: '... {value} ...', max, delta: {<stat field>: amount}}`, about 6 common, 6 rare, 3 epic, tags from `blade fire frost storm guard heart speed gold magic luck poison light crit arrow regen` (shared tags = synergy). Use only stats the game reads; a new stat needs code that reads it. Add a `fallback` (e.g. heal).
3. **Create one instance** once the screen size is known:
```js
const draft = GameDNA_UpgradeDraft.create({
  view: { w: <native width>, h: <native height> }, upgrades: UPGRADES, fallback: FALLBACK,
  params: { seed: {{seed}}, choices: {{choices}}, rerolls: {{rerolls}}, skip: '{{skip}}', wCommon: {{wCommon}}, wRare: {{wRare}}, wEpic: {{wEpic}}, maxStacks: {{maxStacks}}, look: '{{look}}', autoPick: '{{autoPick}}', strip: '{{strip}}', dim: {{dim}} },
  applyDelta: (stat, amount) => { <add amount to the field combat reads>; },
  getStat: stat => <that field>, target: () => <player>, statLabels: { <stat>: 'ATK' },
  autoplay: () => <the game's autoplay flag>, uiRects: () => [ /* HUD bars */ ]
});
```
4. **Open** at that moment (update logic, once per event): `draft.open({ title: 'LEVEL UP' })`. A replaced fixed bonus goes; keep level, XP and heals. Two at once queue.
5. **Pause and input**: top of the fixed step, before the world and autopilot: `if (draft.busy()) { draft.update(<step ms>); return; }`; otherwise `draft.update(<step ms>)` at the end. First in the keydown handler: `if (draft.key(e.code, true)) { e.preventDefault(); return; }`, keyup: `draft.key(e.code, false)`. Polled input: `draft.press('left'|'right'|'confirm'|'reroll'|'skip')` on key-down edges. Esc pauses? Test it before `draft.key`. When the draft opens or closes, clear only buffered taps; never clear held movement keys.
6. **Draw**: `draft.draw(ctx)` last, under the HUD's transform, outside shake. Hide the game's own one-line notice while `draft.busy()`.
7. **Reset / save**: `draft.reset()` at new game; `serialize()`/`restore()` in saves.

**Autoplay must still end**; stronger players may end differently. `autoPick: 'skip'` keeps the original ending.

**Self-check without a browser**
- Module byte-identical, loaded first.
- `open(` once per event; every path to the moment reaches it.
- `update(` every fixed step, also while busy (freeze loop too).
- Every delta stat is read by the game; restart restores base stats.
- Ids unique; rarities valid.
- Walk `open()`: cards deal ~1.1 s -> Z -> `applyDelta` -> card flies -> `busy()` false -> game continues.

**Acceptance checks**
1. {{when}}: the world pauses, 3 cards deal and flip, arrows move, Z takes; the pick flies into the strip.
2. The card's numbers equal the stat change; the next fight uses it; maxed upgrades never return.
3. `?t=<ms>&freeze=1` is deterministic; `?auto=1` still ends with no console errors.
