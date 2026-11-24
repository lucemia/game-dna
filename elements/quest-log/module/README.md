# quest-log.js (H-03 module, v1.1.4)

One plain script, no dependencies, no `import`/`export`, ASCII only. It defines one global, `GameDNA_QuestLog`. Paste it into a `<script>` tag or load it with `<script src>`, without changing it. It owns the whole element: quest data with ordered steps and counters, the rules (counters never pass their target, only the current step counts, events after completion are ignored), the corner tracker, the full quest log panel, "new quest" / "quest complete" banners (or C-14 toasts), optional world markers with edge arrows, placement clear of the HUD, and drawing (smooth glass cards on HD canvases, crisp pixel cards with built-in bitmap fonts on native pixel canvases <= 512 px wide). Your game keeps its own world; it only **reports what happened** and the module advances the quests.

## API

`GameDNA_QuestLog.create(options)` returns an instance.

| option | meaning |
|---|---|
| `quests` | `[{id, title, giver?, desc?, reward?, kind: 'main' \| 'side', next?, auto?, steps: [{text, on: 'type:target', count?, at?, radius?}]}]`. `on` = what completes the step, e.g. `'kill:slime'`, `'collect:herb'`, `'talk:elder'`, `'reach:bridge'` (any words you like; `target` may be `'*'` or an array). `count` (default 1) = how many. `next` = a quest id started when this one completes. `auto: true` = active from the start. |
| `view` | `{x, y, w, h}` (or a function): the screen rect of the play view, in the coordinates `draw` gets. Its width picks the size and crisp (<= 512) or smooth drawing. |
| `safeRects()` | Screen rects the tracker, banners and markers must never cover: HUD bars, score, objective line, minimap, dialogue boxes, menus, touch buttons. Asked every draw; return only what is on screen now. |
| `camera()`, `locate(target, step, quest)` | Optional, for world markers: the world rect shown in `view`, and the world point(s) `{x, y}` of a step's target (or give `step.at`). On screen: a bobbing diamond; off screen: an arrow on the view edge. |
| `player()` | Optional `{x, y}` in world px: completes `reach` steps that have `at` (+ `radius`, default 24) by itself, and keeps banners off the player's sprite. |
| `obstacles()` | Optional screen rects to keep visible (NPCs, the boss): banners avoid them; the tracker fades while the player stands under it. |
| `quiet()` | Optional: `true` while a dialogue, cut-scene or other modal moment runs. Banners wait until it is false (a shown banner fades out and is shown again once, if it was cut short). |
| `toasts` | Optional C-14 `GameDNA_Toasts` instance: start and completion notices go there instead of the own banners. |
| `frame(ctx, rect, 'log')` | Optional: draw the log panel's frame yourself (e.g. painted UI) and return the text-safe inner rect. |
| `onStart`, `onProgress`, `onStep`, `onComplete` | Optional callbacks `(questInfo, stepIndex)`: give rewards, open a gate, play a sound. Wrapped in try/catch. |
| `skin`, `params` | Skin id (`theme: 'skin'` uses its colours); params below. |

Params: `corner` `'tr'` (`'tl'`, `'br'`, `'bl'`), `max` 2 (quests shown in the tracker, 1-4; main quests push side quests out), `width` 0 (auto; else share of the view width), `size` 0 (auto text px: view width / 50, 11-16; crisp: bitmap scale), `render` `'auto'` (`'crisp'`, `'smooth'`), `theme` `'dusk'` (`'parchment'`, `'skin'`), `markers` `'on'`, `banner` `'on'`, `log` `'on'`, `future` `'hidden'` (later steps in the log: `'shown'`), `keyHint` `'J'` (keycap on the tracker; `''` hides it), `logHint` (the log's footer), `bars` `'on'`, `hold` 1100 (ms a finished step stays checked before it collapses), `dodge` `'on'` (move the tracker to a clearly free corner (no keep-out zone within 6 % of the view) once the player, an `obstacles()` rect or an on-screen objective marker / target has sat under it for 450 ms; at most one move per 1.8 s; back home after 2.5 s clearly free; `'off'` keeps the corner and only fades the panel).

| method | |
|---|---|
| `start(id)` | Accept a quest (once; returns false if it is already active or done). |
| `event(type, target, n?)` | Report what happened: `event('kill', 'slime')`, `event('collect', 'herb', 2)`, `event('talk', 'elder')`, `event('reach', 'bridge')`; also `event('kill:slime')`. Only the **current** step of each **active** quest counts; the count is clamped to the target; leftover never spills into the next step; a quest started by this event does not count it. Returns the changes `[{quest, step, count, need, stepDone, questDone}]`. |
| `setCount(id, n)` | "Have N" steps: raise the current step's count to `n` (never lowers). |
| `update(dtMs)` | Every fixed step, every scene, also on the `?t=` replay. Advances banners, the fade and reach checks. |
| `draw(ctx)` | Last: after the world and the HUD, in screen coordinates (outside any camera transform). Draws the tracker (or the log while open), the banner and markers. Never changes quest state. Returns what it drew (also `lastDrawn()`). |
| `input(action)` | `'log'` opens the log; while it is open `'up'`, `'down'`, `'left'` / `'right'` (active / done tabs), `'ok'` (track / untrack), `'back'` / `'log'` (close). Returns `true` when consumed: then do not pass the key to the game. |
| `tap(x, y)`, `hit(x, y)` | Pointer: a tap on the tracker opens the log; in the log, tabs and rows; outside closes. |
| `openLog()`, `closeLog()`, `toggleLog()`, `isLogOpen()`, `busy()` | `busy()` is true while the log is open: pause your world then (human input only, never the autoplay). |
| `track(id, on?)`, `untrack(id)`, `fail(id)` | |
| `quest(id)`, `current(id)`, `active()`, `isDone(id)`, `state()`, `lastDrawn()`, `rect()`, `rects()`, `stats()`, `save()`, `load(obj)`, `reset()`, `setParams(obj)` | `rect()` = the tracker on screen (for other overlays' UI rects); `rects()` adds the banner and the log. `stats()` counts applied and ignored events by reason (`ignoredOrder`, `ignoredDone`, `ignoredInactive`, `ignoredNoMatch`, `ignoredBad`). |

## Integration (15 lines)

```js
// <script src="quest-log.js"></script> before your game script
const quests = GameDNA_QuestLog.create({
  view: { x: 0, y: 0, w: SCREEN_W, h: SCREEN_H },
  safeRects: () => [hudRect, ...(dialogOpen ? [dialogRect] : [])],
  quests: [{ id: 'herbs', title: 'Herbs for the Healer', giver: 'Healer', steps: [
    { text: 'Gather herbs', on: 'collect:herb', count: 3 }, { text: 'Return to the healer', on: 'talk:healer' }] }],
  camera: () => ({ x: cam.x, y: cam.y, w: SCREEN_W, h: SCREEN_H }), locate: t => t === 'healer' ? healer : null,
  params: { corner: 'tr' } });
function talkTo(npc) { /* existing code */ if (npc.id === 'healer') { quests.start('herbs'); quests.event('talk', 'healer'); } }
function pickUp(item) { /* existing code */ quests.event('collect', item.kind); }
function onKill(foe) { /* existing code */ quests.event('kill', foe.kind); }
function step(dt) { /* every scene, also the ?t= replay */ quests.update(dt); }
function render() { drawWorld(); drawHud(); quests.draw(ctx); }
// key you choose: J -> quests.input('log'); while quests.isLogOpen(): arrows / Z / X -> quests.input(...) and nothing else
```

## Keep every other caller working

- Report events from the code that **decides** them (the kill, the pickup, the dialogue's end), once per event, never from a per-frame check that stays true.
- The module never changes game state. Keep the game's own objective text and quest variables (other code reads them); if the HUD already shows the objective line, keep it in `safeRects()` or stop drawing only that line.
- `?auto=1` must end exactly as before: `start`, `event` and `update` never consume the game's random numbers; the log only opens on a human key, and while it is open gate only human input.
- `?t=&freeze=1`: call `update` in the same fixed step the fast-forward runs, or banners and check-offs freeze at their first frame.
- Restart / new game: `quests.reset()` (quests with `auto` start again).

## Self-check without a browser

1. The module file is byte-identical and loads before `create`; `quests` exists before the first `update`, `event` or `draw`.
2. Every `on` in the data matches a `event(type, target)` call in the game with the same words (grep both).
3. Every HUD box drawn in play is in `safeRects()`, in the same coordinates as `view` (logical canvas px, not backing-store px).
4. `camera()` returns world px; `locate` returns world px (not screen px).
5. Walk one example: data `{on: 'kill:slime', count: 3}`, three kills -> 3/3, the step checks off and the next step starts at 0; a fourth kill -> ignored (`stats().ignoredOrder` or `ignoredDone` + 1).

## What it guarantees

- Counters stay in 0..target and never go down; finished steps hold their target; only the current step of an active quest counts; events after completion change nothing (`checks/rules.py`, 2000 fuzzed events, 3 mutants).
- Width: at most 22 % of the view on HD (never under 12.5 text sizes), 27 % on pixel views. Narrow views (< 520 px HD, < 300 px pixel, e.g. phones): one compact line (quest gem, current objective, counter, "+N" other quests), at most 18 % of the stage tall; a tap on it expands the full cards (tap again: collapse), `input('expand')` does the same; the keep-out and dodge rules apply there too.
- The tracker moves to a free corner when the player, an `obstacles()` rect or an on-screen objective marker or target is under it; if no corner is free only its panel fades (to 70 %), the text stays at full strength (`checks/rules.py` dodge / width, 4 mutants).
- One indicator per target: on-screen diamonds first, edge indicators (a disc with the quest diamond and a rim pointer) slide along the edge instead of stacking; no two shown markers overlap (`markers`, 1 mutant).
- Banners: each is shown at most once. When it opens it takes the full banner spot if that is free of the HUD, the tracker, the player, `obstacles()` and objective markers right now, else at once a small corner toast; it waits while `quiet()` is true or no spot is free (dropped after 9 s, or after 3 s when a newer banner is queued). Once shown it runs its full time; a character standing under it dims it to 40 % (it never moves or restarts). A dialogue starting (`quiet()`), a HUD box or the tracker reaching it makes it fade out in 200 ms (clipped off the HUD) and it is dropped, not re-queued (the log has it).
- Stable placement: any jump of the tracker (a HUD box appeared, a corner change) fades in at the new spot; corner hops never land on a banner. On phones the compact line shrinks its type (to 82 %) before cutting the objective (`checks/temporal.py`, whole demo at 1280 / 500 / 390 px, 3 mutants).
- The log is a full-height sheet with a pager on narrow views; long pages scroll with `up` / `down` (then the selection moves), with a scrollbar and a "more" fade and chevron; titles wrap instead of being cut.
- Tracker cards, banners and markers never touch a rect from `safeRects()`; text boxes never overlap and stay inside their card, banner or panel (`checks/rules.py`, 3 canvas sizes x 4 corners x 40 HUD layouts, 2 mutants). No room in any corner: a one-line compact card; still none: nothing drawn (`stats().noRoom`).
- Deterministic: same `start` / `event` / `update` calls, same pixels; no `Math.random`, no wall clock, no network fonts.
- Never throws from `event`, `update` or `draw`; a bad callback logs one warning.
