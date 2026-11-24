Defaults: `{{format}}` = single, `{{textSpeed}}` = normal, `{{advance}}` = auto, `{{drain}}` = normal, `{{hints}}` = on

---

Turn the battles in my game into **four-move menu battles with type matchups**, using the module `four-move-battle.js` and its `README.md` given with this prompt. The module owns the whole battle (turn order, accuracy, crits, type chart, statuses, switching, fainting, win / lose, messages, menus, the classic screen and its animations); my game supplies content and calls it.

**1. Include the module verbatim** in its own `<script>` before my game script; never edit it. Its only global is `GameDNA_FourMove`. Its README lists every option.

**2. Map my battle onto it** (by role; my game may differ):
- **Combatants → creatures** `{id, name, level, types, hp, maxHp, atk, def, spd, moves}` from my stats. If my party fights together, one hero is out at a time and the rest are the bench (two out if `{{format}}` is double).
- **An enemy group, wave or encounter → one battle;** its enemies come out one after another.
- **Commands → moves (at most 4 per creature).** Basic attack → a move; each spell → a move whose MP cost becomes uses (`max(1, floor(maxMp / cost))`); defend → `{kind: 'status', target: 'self', effect: {guard: true}, priority: 3}`; heal spell → `{effect: {heal: 0.4}}`; group spell → `target: 'allFoes'`. Items stay items via `items()` / `useItem()`.
- **Elements → types** with `strong` / `weak` / `none` lists (invent 3-6 if my game has none). Give every foe a type.
- **Enemy AI:** `chooseFoe(view)` may call my chooser; `null` uses the module's.

**3. Integration points:**
- Where a battle starts: `battle = GameDNA_FourMove.create({view: {x: 0, y: 0, w: <canvas w>, h: <canvas h>}, seed, teams, moves, types, sprite, drawBackground, onEnd, params: {format: '{{format}}', textSpeed: '{{textSpeed}}', advance: '{{advance}}', drain: '{{drain}}', hints: '{{hints}}', auto: <my autoplay flag>}})`. `sprite(src, view)` returns my existing sprite of that combatant (same image for `'back'` is fine); `drawBackground` draws my battle backdrop.
- My fixed step: `battle.update()` once per step, in every loop that steps the game, fast-forwards included.
- My battle drawing: replace combatant, menu and HP-panel drawing with `battle.draw(ctx)`; keep my overlays (banners, results) after it.
- My input: while a battle runs, keys go to `battle.key('up' | 'down' | 'left' | 'right' | 'ok' | 'back')`, taps to `battle.tap(x, y)` (native px).
- `onEnd(result, snapshot)`: copy HP back from `snapshot.own`, then run my existing victory / next-wave / defeat code once.
- My autoplay: `battle.setAuto(true)`; remove only its battle-command branch, keep its title and between-wave presses.

**4. Self-check without a browser** (report each):
1. Every function and name that existed still exists; grep each changed call site.
2. Every identifier used at load time is defined; `node --check` each script.
3. Trace one turn: OK → FIGHT → move → both sides act in speed order → menu returns.
4. Trace the last foe fainting: `onEnd('win')` → next wave or victory runs once; my last creature fainting → defeat once.
5. Trace autoplay from the title to the first battle's end.

**5. Acceptance** (screenshot if you can):
- Foe top-right with name / level / HP box, mine bottom-left, message box; FIGHT opens a 2×2 move menu with type and uses.
- A strong-type hit shows its matchup message; HP drains; a fainted foe sinks and the next comes out.
- Switching uses the turn; uses count down.
- My autoplay finishes the whole game; title and restart work; no console errors; no horizontal scroll at 500 px.
