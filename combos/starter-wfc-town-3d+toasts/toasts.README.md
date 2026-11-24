# toasts.js (C-14 module, v1.1.1)

One plain script, no dependencies, no `import`/`export`. It defines one global, `GameDNA_Toasts`. Paste it into a `<script>` tag or load it with `<script src>`, without changing it. It owns everything about the notices: card layout and measuring, the slide/pop/fade entrance, the stack and its gliding reflow, hold timers with a visible timer line, merging duplicates into one card with a `×N` badge, the queue and its "+N more" chip, keeping inside a safe area and around the game's UI rects, and drawing (smooth glassy cards on HD canvases, a crisp pixel card with built-in bitmap fonts and 7×7 icons on native pixel canvases). Your game keeps its own state and only tells the module what happened.

Toasts **never pause the game and never read input**: `busy()` is always `false`.

## API

`GameDNA_Toasts.create(options)` returns an instance.

| option | meaning |
|---|---|
| `bounds` | The screen `{x, y, w, h}` in your game's logical (native) canvas pixels, or a function returning it. Give it: before the first draw the module cannot know your canvas, and it uses the width to choose sizes and crisp or smooth drawing. |
| `uiRects()` | Function (or array) returning rects `{x, y, w, h}` toasts must never cover: HUD panels, minimap, hotbar, message lines, captions, banners, open windows. Read every update, so return only what is on screen now. A card that meets a rect moves past it along the stack; one that no longer fits leaves early; a waiting card waits for room. |
| `params` | See the table below. |
| `skin` | Optional `GameDNA_Skin` id or object (`skins/skin-api.js`): a pixel skin selects the crisp card; `theme: 'skin'` takes the colours from `ui.fill` / `ui.edge` / `text.*`. Without it the module draws its own look. |
| `debug(info)` | Optional: events `push`, `merge`, `enter`, `exit` (`why`: timeout, noroom, dismiss, clear), `wait`, `drop`, `clear`. |

| param | default | range | meaning |
|---|---|---|---|
| `edge` | top-right | top-right, top-left, top, bottom-right, bottom-left, bottom | Where the stack lives; cards slide in from that side. Top stacks grow down, bottom stacks grow up; the oldest card stays nearest the edge. |
| `max` | 3 | 1–5 | Cards on screen at once; more wait in the queue (a "+N more" chip shows how many). While cards wait, the visible ones leave sooner (hold × 0.65, × 0.45 past 2 waiting, never under 1.1 s). |
| `hold` | 2800 | 1200–6000 ms | Time on screen, entrance included. Per kind: achievement × 1.4, level × 1.2, quest and unlock × 1.15, warning × 1.1, info × 0.9. |
| `merge` | on | on, off | A push with the same `key` as a card on screen or waiting adds to its count (`×3` badge punches, timer restarts) instead of a new card. Warning, info and quest cards punch and restart without a `×N` badge (v1.1: "wounded ×2" read as "wounded twice"). |
| `enter` | slide | slide, pop, fade | Entrance (and matching exit). |
| `size` | 0 | 0–24 | Title text px (smooth) / bitmap scale × 7 (crisp). 0 = auto: width / 52 (12 px at 640), crisp scale 1 up to 300 px wide. |
| `margin` | 0 | 0–40 | Safe-area inset from the screen edge in px. 0 = auto (2.2 % of the width, at least 4). |
| `theme` | dusk | dusk, frost, ink, skin | Card colours: dark glass, light glass, solid black with a light rim. |
| `progress` | on | on, off | Thin timer line along the card's bottom. |
| `more` | on | on, off | The "+N more" chip after the stack while cards wait. |
| `render` | auto | auto, smooth, crisp | auto: crisp when drawing 1:1 on a canvas ≤ 512 px wide (native pixel games), smooth otherwise. |

| method | |
|---|---|
| `push(kind, title, opts?)` | Call once, on the frame the event happens. `kind`: `achievement`, `quest`, `item`, `unlock`, `level`, `info`, `warning`. `opts`: `text` (second line), `count` (adds this many; `0` updates an existing card's text without a badge, for quest progress), `key` (merge key; default kind + title), `label` (small line above the title; default per kind: "Achievement unlocked", "Quest updated", "Received", "Unlocked", "Level up", "Notice", "Warning"), `icon` (`trophy`, `flag`, `gem`, `lock`, `arrow`, `info`, `alert`, `coin`, `heart`, `star`, and from v1.1 `leaf`, `potion`, `pouch`, `sword`), `rarity` (`common`, `uncommon`, `rare`, `epic`, `legendary`: item colour and label), `accent` (hex colour), `hold` (ms), `priority: 'high'` (jumps the queue). A title containing `{n}` shows the count there (`'+{n} Coins'`) instead of a badge. Returns the card id. Also `show({kind, title, ...})`. |
| `update(dtMs)` | Every fixed step, **in every scene and while your menus are open**, so cards finish and leave. `update(0)` holds every timer (e.g. while a full-screen pause menu covers them). All motion depends only on this clock. |
| `draw(ctx)` | Once per frame, last: after the world and the HUD, in screen coordinates (outside any camera translate). Any canvas transform that scales logical px to the backing store is fine. |
| `clear(now?)` | Cards leave (or vanish with `true`) and the queue empties. For "new game", not for scene changes. |
| `dismiss(id)`, `setParams(obj)`, `count()`, `queued()`, `rects()`, `lastDrawn()`, `stats()`, `state()`, `busy()` | `rects()` = target rects of the cards and chip (for other overlays to avoid). `lastDrawn()` = what the last draw showed `{id, kind, title, count, phase, x, y, w, h, alpha}`. |

## Integration (15 lines)

```js
// <script src="toasts.js"></script> before your game script
const toasts = GameDNA_Toasts.create({
  bounds: { x: 0, y: 0, w: SCREEN_W, h: SCREEN_H },        // logical canvas px
  uiRects: () => [hudPanelRect, minimapRect].concat(openWindowRects()),   // what must stay visible now
  params: { edge: 'top-right', max: 3, hold: 2800 }
});
function onItemPickup(item) { /* existing code */ toasts.push('item', item.name, { rarity: item.rarity }); }
function onQuestStep(q) { /* existing code */ toasts.push('quest', q.title, { key: 'quest-' + q.id, text: q.done + ' / ' + q.need, count: 0 }); }
function onAchievement(a) { toasts.push('achievement', a.title, { text: a.desc }); }
function step(dt) { /* every scene, menus included */ toasts.update(dt); }
function render() { /* world, effects, HUD, windows */ toasts.draw(ctx); }
// new game: toasts.clear(true);
```

Push from the place where the event is **decided** (the code that adds the item, advances the quest, unlocks the door), once per event, not from a per-frame check that stays true. If your game already draws a one-line notice for the same event ("Bought X", "Level 2!"), stop drawing only that line (keep any variables other code reads) so the player gets one message, not two. Phase banners, titles, captions and result screens ("WAVE CLEARED", "VICTORY") are not notices: leave them alone and pass their rects. Give every HUD element that is on screen to `uiRects()`; in a scrolling game return screen rects (world minus camera). On small or turn-based screens where units stand under the stack's corner (a battle party top-right, a tactics grid), also return those units' formation box, so cards sit beside or below them instead of hiding them (or choose an `edge` over empty background).

Quest progress: push it only when the objective's count changes, with one fixed `key` per quest and `count: 0` (`{key: 'q-' + id, text: done + ' / ' + need, count: 0}`); a new quest gets a new key.

## What it guarantees

- A pushed card enters within one update when there is a free slot and room, never covers a rect from `uiRects()` or another card, and keeps `margin` px from the screen edge.
- Cards never slide over UI or across each other: when the stack reflows (a card leaves) they glide (spring, ~250 ms) and a leaving card's slot collapses smoothly; when a UI rect appears over a card it steps out at once; when its slot jumps (a window took the column) it vanishes and fades in at the new slot. A rect that clips the column's inner side by a hair nudges the card toward the edge (at most half the margin) instead of moving it. When the edge column has no room at all, a card fades in beside the blocking rect on the same row.
- Same key = one card: counts add up, the badge punches, the timer restarts; quest progress with `count: 0` refreshes the text in place.
- Queue: FIFO (`priority: 'high'` first), at most 24 waiting (the oldest `info` drops first), "+N more" chip, faster turnover while cards wait.
- Deterministic: same `push` and `update` calls, same pixels. No `Math.random`, no wall clock, no network fonts (system sans stack; crisp mode uses its own bitmap fonts).
- Never throws from `push`, `update` or `draw`; a bad `uiRects` or `bounds` callback logs one warning.
- Cost: about 0.17 ms per frame (`update` + `draw`) with 3 cards and the "+2 more" chip on the demo's 640×360 field at a 1280 px backing store (headless Chromium, 2026-11-16). Text widths are cached; the crisp pixel icons are built once per colour.
