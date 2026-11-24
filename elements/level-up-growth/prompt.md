# Add level-ups and stat growth to my game

**Required:** `{{when}}` = when EXP is awarded and the results window shows, in your words (e.g. "after every won battle, EXP and gold from the defeated enemies").
Defaults:
`{{base}}` = 20 · `{{power}}` = 1.5 · `{{maxLevel}}` = 20 · `{{minGain}}` = 1 · `{{seed}}` = 1 · `{{countMs}}` = 1500 · `{{autoMs}}` = 900 · `{{panel}}` = on · `{{share}}` = each · `{{autoGrowth}}` = apply · `{{tint}}` = a · `{{dim}}` = 0.4

---

You are given `level-up-growth.js`, a finished module, and its `README.md`. **Include the module verbatim** (`<script src>` before the game script, or pasted unchanged into its own `<script>`); never rewrite it. It defines `GameDNA_LevelUpGrowth`: EXP, levels, growth, results window, level-up panels.

**Award EXP exactly: {{when}}.**

Add code; never remove or rename functions.

**First, read my game** and note: the fixed step and loops (`?t=&freeze=1`, autoplay); confirm input; draw pass and HUD; **where a fight is won** and what runs next; unit ids and the stat fields combat reads; restart; save.

**Integration points**

1. **Load** the module before the game script.
2. **Growth tables**: per class `{rates: {<stat field>: percent}}`; HP as `{rate, amount}`, amount ≈ 5 % of start.
3. **Create one instance** once the screen size is known:
```js
const lv = GameDNA_LevelUpGrowth.create({
  bounds: { x: 0, y: 0, w: <screen width>, h: <field height> }, classes: GROWTH, stats: [{ key: '<field>', label: 'HP' }, ...],
  params: { base: {{base}}, power: {{power}}, maxLevel: {{maxLevel}}, minGain: {{minGain}}, seed: {{seed}}, countMs: {{countMs}}, autoMs: {{autoMs}}, panel: '{{panel}}', share: '{{share}}', autoGrowth: '{{autoGrowth}}', tint: '{{tint}}', dim: {{dim}} },
  units: () => party.map(u => ({ id: <stable id>, name: <name>, cls: <class>, alive: <hp > 0>, get: k => <field k>, set: (k, v, gain) => { <write v> } })),
  autoplay: () => <the game's autoplay flag>,
  uiRects: () => [ /* HUD, command panel */ ]
});
```
Stats change only through the setter: write what combat reads, never a shared template; max HP: add `gain` to HP too.
4. **Award** at the win point (once per win, update logic): `lv.award(exp, gold, { title: 'VICTORY', onDone: r => { purse += r.gold; ... } })`: add gold **in `onDone`** (else the HUD jumps ahead of the count-up); move what ran next there unless it waits. Per-hit EXP: `lv.addExp(id, n)`; `award(0, 0, {units: [id]})` shows it.
5. **Input and pause**: top of the fixed step: `if (lv.busy()) { if (<confirm pressed this step>) lv.press(); lv.update(<step ms>); return; }`; otherwise `lv.update(<step ms>)` at the end; pause/restart keys stay outside.
6. **Draw**: `lv.draw(ctx)` last, outside shake. **HUD hook**: print `lv.shown(id, key)` / `lv.shownLevel(id)`, never raw stats (set inside `award()`).
7. **Reset / save**: `lv.reset()` at new game; `serialize()`/`restore()` in saves.

**Autoplay must still end**; stronger units may change the ending. `autoGrowth: 'hold'` keeps the original ending (stats wait). Say which in your notes.

**Self-check without a browser**
- Module byte-identical, loaded first.
- `award(` once per win; every win path reaches it.
- `update(` every fixed step, also while busy (freeze loop too).
- Setter writes what combat reads; restart restores base stats.
- HUD reads `shown()`/`shownLevel()`; gold is added in `onDone`.
- Walk `award(45, 12)` to a level-1 unit: level 2 → setter at once → count 1.5 s → panel → `onDone` → game continues.

**Acceptance checks**
1. {{when}}: EXP and gold count up, gauges wrap with LV UP!, then a +N panel per levelled unit.
2. Panel gains equal stat changes; the next fight uses them.
3. `?t=<ms>&freeze=1` is deterministic; `?auto=1` still ends with no console errors.
