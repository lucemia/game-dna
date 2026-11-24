# Add bouncing damage numbers to my game

Defaults (change any of these before pasting):
`{{bounce}}` = 10 · `{{duration}}` = 1000 · `{{stagger}}` = 40 · `{{hitstop}}` = 60 · `{{scale}}` = 1 · `{{scheme}}` = classic · `{{crit}}` = burst · `{{stack}}` = on · `{{outline}}` = 1

---

You are given `damage-numbers.js`, a finished module (glyphs, motion, all kinds, stacking, drawing). **Include it verbatim** (`<script src>` before the game script, or pasted unchanged into its own `<script>`). Never rewrite or "fix" it. It defines one global, `GameDNA_DamageNumbers`.

Only wire it in. Add code; never replace or rename existing functions.

**Integration points** (my host's names):

1. **Load the module** before the game script.
2. **Create one instance** after `A`, `S`, `actorBox`, `bannerBox`, `W` and `FIELD_H` exist, before `resetBattle()` is first called:
```js
const DN = GameDNA_DamageNumbers.create({
  bounds: { x: 0, y: 0, w: W, h: FIELD_H },
  params: { bounce: {{bounce}}, duration: {{duration}}, stagger: {{stagger}}, hitstop: {{hitstop}}, scale: {{scale}}, scheme: '{{scheme}}', crit: '{{crit}}', stack: '{{stack}}', outline: {{outline}} },
  getAnchor: id => { const a = A(id); if (!a) return null; const b = actorBox({ ...a, x: a.hx, y: a.hy }); return { x: a.hx, top: b.top - (a.id === 'wisp' ? 3 : 0), w: b.w, h: b.h }; },
  getObstacles: () => {
    const o = S.actors.filter(a => !a.dead).flatMap(a => [[a.x, a.y], [a.hx, a.hy]].map(([x, y]) => { const b = actorBox({ ...a, x, y }); return { x: b.x + 1, y: b.top, w: b.w - 2, h: b.h, id: a.id }; }));
    if (S.banner && S.wt < S.bannerUntil) o.push(bannerBox(S.banner));
    return o;
  },
  onHitStop: ms => { S.stop = Math.max(S.stop || 0, ms); },
  onShake: () => { S.shakeT = S.rt; },
  onFlash: () => {}
});
```
3. **Spawn** in `applyHit(target, amount, kind)`: first line `const hp0 = target.hp, mp0 = target.mp;`, last line (real drop after clamping):
`DN.spawn(target.id, kind === 'status' ? 'POISON' : kind === 'mp' ? mp0 - target.mp : kind === 'miss' ? 0 : Math.abs(hp0 - target.hp), kind === 'poison' ? 'damage' : kind);`
Call `spawn` nowhere else.
4. **Advance** in `step()`: first line
`if (S.stop > 0) { S.stop -= FRAME; S.rt += FRAME; DN.update(0); return; }`
and after `S.wt += FRAME`: `DN.update(FRAME);`
5. **Draw** in `render()` right after the `S.fx = S.fx.filter(...)` line: `DN.draw(g);`
6. **Clear** at the start of `resetBattle()`'s new battle, before anything spawns: `if (typeof DN !== 'undefined') DN.clear();`

`getAnchor` must keep returning a unit's spot after it dies (never `null` for HP 0), so killing blows show above it.

**Self-check without a browser**
- Grep: the module file is byte-identical to the one you were given, and `spawn` appears only in `applyHit`.
- Every identifier used by the six snippets (`A`, `S`, `actorBox`, `bannerBox`, `W`, `FIELD_H`, `FRAME`) exists before the instance is created. `DN` exists before `resetBattle()` runs (or is guarded).
- No host function removed or renamed.
- Walk one hit: `applyHit` → `DN.spawn` → `onHitStop` → `DN.update(0)` while frozen → normal updates; `draw` every frame.

**Acceptance checks** (screenshots if you can)
1. A sword hit shows a white number above the target on the hit frame. Its digits pop up one after another, bounce, hold, then fade.
2. A Spark critical is gold, with a `CRITICAL` label, a flash and a shake. A heal is green with `+` first. A miss reads `MISS`. A mana drain reads e.g. `12 MP`. A hex reads `POISON`.
3. Numbers never touch each other, a neighbour's sprite, the banner or the HUD; every number appears on its hit frame.
4. `?auto=1`: two minutes, no console errors.
