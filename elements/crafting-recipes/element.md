# G-06 Crafting recipes

## What it is

A crafting window over the game's own inventory. On the left a recipe book: a grid of recipe cards, learned ones in colour (a green dot when you hold everything for it now, a sparkle while it is new), unknown ones as dark silhouettes of their result with a "?" and a hint ("Learn it by holding Iron Ore and Coal", "Discover it by trying a mix"). On the right the bench: three slots joined by "+" signs, an arrow and the result slot. Picking a learned recipe lays its ingredients on the bench with have / need under each slot (green or red) and previews the result; Craft fills a short work bar in the result slot while the ingredients fly in, then takes each ingredient once, gives the result once, pops it with sparks and prints "+1 Iron Ingot". Below, the pouch lists the game's ingredients with counts; putting them on the bench builds your own mix ("Unknown mix", previewed as a glowing "?"); trying a mix that matches a recipe nobody taught you discovers it (DISCOVERED toast) and crafts it, a mix that matches nothing shakes the bench and says "Nothing happens". Missing ingredients shake the bench with "Need 1 Iron Ingot". A failed try costs nothing. Recipes are also learned by holding all their ingredients, by crafting a parent recipe, or by the game's own unlock (a scroll, a teacher); each new recipe gets one NEW RECIPE toast.

## Default parameters

| key | default | meaning |
|---|---|---|
| slots | 3 | bench slots (1-6; a recipe with more inputs widens its bench) |
| craftMs | 650 | work bar before the take / give (0 = instant) |
| theme | forge | `forge` (dark wood and gold) or `parchment`; a `frame(ctx, rect, role)` callback draws painted frames instead |
| toasts | on | NEW RECIPE / DISCOVERED toasts (CRAFTED when crafting from code with the window closed) |
| toastMs | 2600 | a toast's full-alpha time (in 260 ms, out 320 ms; never under 900 ms) |
| title | Workbench | window title (`open(title)` overrides it per bench) |
| keyHints | on | key line at the bottom and `[Z]` / `[C]` on the button (touch: "Tap a recipe, tap again to craft") |
| hints | on | the unknown recipe's hint / the learned recipe's description under the button |
| minCss | 10 | smallest text in CSS px (needs `canvas` or `cssScale`) |
| render | auto | crisp when the view is 512 px wide or less |

## Variants

- **Workbench** (default): 3 slots, 650 ms, forge look.
- **Alchemy table**: 4 slots, 1100 ms, parchment look.
- **Field kit**: 2 slots, instant, opened with a key anywhere.

## Interface

Needs: the game's item record through `inventory: {count, take, give}` (or a plain `{id: count}` object), item names / icons, the recipe data with how each is learned, the screen rect, the canvas (for CSS size), `avoid()` (player, bench, NPC screen rects), `uiRects()` (HUD), a fixed `update(dt)` call (also the `?t=` fast-forward), an opening key or bench in update logic, keys (`key(code)`) and pointer (`pointer(type, x, y)`) while `busy()`, `draw(ctx)` last.

Provides: `onCraft({recipe, out, n, inputs, discovered})` after the take / give, `onUnlock({recipe, why})`, `onFail({reason, text})`, `onOpen`, `onClose`; `busy()`; `rect()` / `rects()` for other overlays; `state()`, `events()`, `stats()`, `hash()`, `layout()`, `lastDrawn()`; `save()` / `load()`; code actions `craft(id)`, `tryMix(ids)`, `unlock(id)`.

## Screen rules

- Placement: the first `avoid()` rect is the player: the window never cuts it with an edge (fully clear; fully covered only when no spot of either layout clears it, a phone sheet). Two layouts, wide (book left, bench right, about 29 x 18 text sizes) and tall (book above the bench, about 16 x 25). The window takes the free spot nearest the view centre that covers no `uiRects()` and no `avoid()` rect (and, softly, not a toast already showing); it covers an avoid rect only when no spot of either layout avoids it, and it covers the HUD only when even that fails (a phone-size view: a sheet). Chosen at open; it never moves while open (a changed HUD rect crossfades in 160 ms). Opens with a 200 ms fade and a slide of 0.6 text sizes; closes in 150 ms.
- Text: HD body text = view width / 66 (11-22 px), small text 0.82 of that, both raised to `minCss` CSS px; crisp: the 6x8 bitmap font at an integer scale (never smaller than `minCss`), 5x6 only where it stays >= `minCss`. Titles ellipsize; nothing overlaps another text or a button; everything stays inside its window or toast.
- Book cells 2.7 text sizes (crisp 18 px), icons 70 %; rows scroll by whole rows to keep the selection visible (a scroll bar shows when they do). Bench slots 2.6 (crisp 18), result 3.0 (crisp 20), have / need under each slot.
- Work bar: fills the result slot from the bottom and the button's edge; ingredient icons fly to the result in the first 75 %; take / give at 100 %; pop 520 ms (scale 1.35 peak, 8 sparks); "+N Name" 2.3 s.
- Failure: bench shakes 360 ms (amplitude 0.4 text sizes, decaying), failing slots tint red, a red reason for 2.3 s, no count changes.
- Toasts: one at a time, spot chosen when it starts (top centre, bottom centre, then corners; clear of the HUD band, the window and avoid rects), slides in 0.6 text sizes over 260 ms, holds `toastMs`, fades 320 ms, 140 ms gap; never moves; dims to 40 % when something to keep visible comes under it; if the window opens over it, it fades out in 180 ms and is not shown again; when no spot is clear of the open window (a phone sheet) it is shown in the window's title row (icon, label, name) instead of over the window's text, and leaves with the window.
- Icons: 40 built-in shapes shaded per pixel: 4 hard tones and a 1 px outline on crisp canvases, smooth dome light and a soft outline on HD; tinted by `item.color`; or the game's icon sheet / `draw` callback.

## Common mistakes

| symptom | fix |
|---|---|
| counts drift between HUD and bench | one record: `count` / `take` / `give` read and write the game's own counters; no copy |
| a result arrives twice or ingredients vanish twice | never give or take crafting items in `onCraft`; the module already did |
| world keeps moving / enemies hit while crafting | the step returns early while `busy()` (after `craft.update`) |
| the opening key also attacks or talks | open in update logic and clear that key; keys go only to `craft.key` while open |
| window covers or cuts the player, or hides the bench | pass the player's screen rect FIRST in `avoid()` (where it stands when the window opens), then the bench and NPCs |
| tiny text on phones | pass `canvas` (or `cssScale`) so text keeps 10 CSS px |
| `?auto=1` ends differently | the autopilot never opens the bench; new drops use counters, not the game's random numbers |
| `?t=&freeze=1` still differs from play | call `update` in the fixed step the fast-forward runs |

## Acceptance moments

Each moment is a `?t=&freeze=1` still of the demo (`?look=pixel` for the pixel look) and the event it must show; `checks/moments.py` confirms the event happened in the moment's window and is on screen.

1. `?t=1500` **unlock** (have): the game gave Storm Spark + Frost Shard (pixel: Iron Ore + Coal); a NEW RECIPE toast for Storm Tonic (Iron Ingot) at a free spot.
2. `?t=3800` **open**: the bench window beside the player (HD: right of the knight and the anvil; pixel: the hero at the workbench stays visible), the book with learned, new and locked recipes, the selected recipe on the bench with have / need, the result preview, the pouch.
3. `?t=5100` **craft**: Healing Draught (Healing Salve) granted: the result pops with sparks, "+1 Healing Draught", pouch and have / need counts dropped by exactly the inputs.
4. `?t=7500` **unlock** (crafted): crafting Storm Tonic (Iron Ingot) teaches Tempest Staff (Iron Sword): its toast sits clear of the window and the player.
5. `?t=8850` **fail** (missing): Tempest Staff needs 2 Storm Tonic, 1 held: the bench shakes, the slot tints red, "Need 1 Storm Tonic"; nothing consumed.
6. `?t=11550` **fail** (nothing): a mix of Lifebloom + Ember Core (Herb + Coal) matches nothing: "Nothing happens"; nothing consumed.
7. `?t=14700` **put**: an own mix on the bench (Ember Core x2 + Ruby; pixel Slime Gel + Glow Crystal + Iron Ingot), "Unknown mix", the result slot shows a glowing "?" and the button reads "Try mix".
8. `?t=16300` **unlock** (experiment): the mix discovered Ember Ring (Glow Lantern): DISCOVERED toast, the result popped in the result slot, "+1 Ember Ring", the new card selected with its sparkle.
9. `?t=19500` **close**: the window closed; the game reacts to the crafted item (HD: a flash on the knight when it is made, then a dark-rimmed warm pool at his feet and glowing embers with trails rising around him, ATK 12 -> 15 and the red-gem Ember Ring in the HUD; pixel: the hero walks out with the lantern lighting the dim room, the lantern in the HUD slot).
