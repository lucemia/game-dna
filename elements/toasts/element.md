# C-14 Toasts & unlock pop-ups

## 1. What it is

The notification layer of 2020s games: small cards that tell the player something good (or worth knowing) happened without stopping play. A card slides in from a screen edge with a slight overshoot, shows a coloured icon badge, a small upper-case label ("ACHIEVEMENT UNLOCKED", "QUEST UPDATED", "RECEIVED", "UNLOCKED", "LEVEL UP"), a bold title and an optional second line, holds while a thin timer line drains along its bottom, then slides back out. Several cards stack; when one leaves, its slot collapses and the rest glide into place on a spring. The same item picked up again does not add a card: the existing card's **×N badge** punches and its timer restarts; quest progress pushed with `count: 0` rewrites one card in place ("2 / 5" → "3 / 5"). When more events arrive than `max` cards, the rest wait behind a **"+N more" chip** and the visible cards leave sooner, so a loot burst drains in a few seconds.

Cards keep a safe-area margin from the edge and step around every rect the game reports (HUD panel, minimap, objective line, caption, banner, open windows). When a window opens over the stack and a card has no legal slot left, it disappears at once (or fades in 150 ms if nothing covers it), keeps its remaining time, and comes back when the window closes. Toasts never pause the game, never read input and never block (`busy()` is `false`).

Achievements and unlocks (and epic / legendary items) get a light sheen across the card after it lands; achievements also throw a few sparkles from the badge. On HD canvases the card is glass: vertical gradient, soft drop shadow, accent wash from the icon side, inner highlight rim, vector icons. On native pixel canvases (≤ 512 px wide, drawn 1:1) the module switches to a crisp card by itself: built-in 5×7 and 3×5 bitmap fonts, 7×7 pixel icons with a 1 px outline, whole-pixel motion and a four-step fade.

## 2. Default parameters

| Key | Default | Range | Meaning |
|---|---|---|---|
| `edge` | top-right | top-right, top-left, top, bottom-right, bottom-left, bottom | Stack position; cards slide in from the nearer side (from above / below for the centre edges). Top stacks grow down, bottom stacks grow up, oldest nearest the edge |
| `max` | 3 | 1–5 | Cards on screen; the rest queue |
| `hold` | 2800 ms | 1200–6000 | Life on screen including the entrance. Kind factors: achievement ×1.4, level ×1.2, quest and unlock ×1.15, warning ×1.1, item ×1, info ×0.9 |
| `merge` | on | on, off | Same `key` (default kind + title) on screen or waiting → one card, count added, badge punch, timer restart; warning, info and quest cards show no ×N badge. A card already up 3 × its hold takes no more merges (a new card follows) |
| `enter` | slide | slide, pop, fade | Entrance and matching exit |
| `size` | 0 = auto | 0–24 | Smooth: title px, auto = width / 52 clamped 10–22 (12 px at 640). Crisp: bitmap scale = round(size / 7), auto = 1 up to 300 px wide |
| `margin` | 0 = auto | 0–40 px | Safe-area inset; auto = max(4, 2.2 % of width) (14 px at 640, 6 px at 256) |
| `theme` | dusk | dusk, frost, ink, skin | Dark glass, light glass, solid ink with a light rim, or the skin's `ui.*` / `text.*` tokens |
| `progress` | on | on, off | Timer line |
| `more` | on | on, off | "+N more" chip |
| `render` | auto | auto, smooth, crisp | auto = crisp on a ≤ 512 px canvas drawn 1:1 (or a pixel skin), smooth otherwise |

## 3. Variants

- **Modern RPG corner**: the defaults: top-right under the minimap, three cards, slide.
- **Loot feed**: bottom-left, 5 cards, 2.2 s, ink theme, no timer line: a survival / ARPG pickup log.
- **Achievement pop**: top centre, one card at a time, 4 s, pop entrance.
- **Light and calm**: frost theme, fade, two cards, 3.6 s.
- **Pixel host**: `render: crisp` on a native 256-wide game.

Kinds (accent, icon, default label): achievement (gold `#ffc53d`, trophy, "Achievement unlocked"), quest (sky `#5fc8ff`, flag, "Quest updated"), item (mint `#7fe39a`, gem, "Received"), unlock (violet `#c48bff`, open padlock, "Unlocked"), level (orange `#ff9e4a`, up arrow, "Level up"), info (steel `#a9b7d6`, i, "Notice"), warning (red `#ff6457`, triangle, "Warning"). Item rarity recolours the accent and label: uncommon `#7fe39a`, rare `#5ab0ff`, epic `#c07cff`, legendary `#ffb340` ("Rare item"). Extra icons: coin, heart, star, leaf, potion, pouch, sword (use them so a loot feed is not five identical gems).

## 4. Interface

**Needs**
- `push(kind, title, {text, count, key, label, icon, rarity, accent, hold, priority})` once per event, at the code that decides it (not a per-frame condition).
- `update(dtMs)` every fixed step in every scene, including while the game's own menus are open (`update(0)` holds every timer).
- `bounds`: the screen in logical px (decides sizes and crisp vs smooth before the first draw).
- `uiRects()`: rects of everything that must stay readable now (HUD, minimap, message lines, captions, banners, windows), read every update and every draw.

**Provides**
- Non-blocking notices; `busy()` always `false`.
- `rects()` (cards and chip, for other overlays), `lastDrawn()` (`{id, kind, title, count, phase, settled, x, y, w, h, alpha}`), `stats()`, `state()`, `debug` events: push, merge, enter, exit (timeout, dismiss, clear), hide / show (no room), wait, drop, clear.

**Skins.** Optional `skin`: a pixel skin forces the crisp card; `theme: 'skin'` takes `ui.fill`, `ui.fillTo`, `ui.edge`, `ui.highlight`, `text.main`, `text.dim`, `ink`. Without the option the module draws its own look.

**Delivery.** `module/toasts.js` (global `GameDNA_Toasts`, API and a 15-line integration in `module/README.md`), `prompt.md`, `tools/basket/toasts.mjs`, judge probe `judge/probes/toasts.js`. The demo runs on the module (an HD instance and two crisp 256×144 instances).

## 5. Screen rules (exact numbers)

Smooth card, S = title px:
- Padding round(0.68 S); icon badge diameter round(2.3 S); gap to text round(0.75 S); label `800 max(9, 0.72 S)px`, upper case, letter spacing 0.06 S, accent mixed 10 % toward the title colour; title `700 S px`; second line `500 max(9, 0.82 S)px`. Height = max(badge, label × 1.25 + title × 1.25 + line × 1.35) + 2 × padding.
- Width = content, clamped to [26 %, 44 %] of the screen width (and the screen minus 2 margins); longer titles end in "…".
- Corner radius 0.7 S; drop shadow blur 1.3 S, offset y 0.35 S (scaled by the device transform); 1 px rim (accent 75 % on achievements, unlocks, epic / legendary) and a 1 px inner highlight; timer line max(2, 0.16 S) px.
- ×N badge: pill 1.2 S tall in the accent, `800 0.86 S px` text, 0.4 S after the title.

Crisp card, sc = bitmap scale:
- Outline 1 sc, body two-tone (top half lighter), 1 sc highlight line, 2 sc accent strip on the left; padding 3 sc; icon 9 × 9 sc; label 3×5 font in the accent; title 5×7 font with a 1 sc drop under light text; second line 3×5; timer line 1 sc. Height 20 sc (27 sc with a second line); width ≤ 50 % of the screen; ".." when cut.
- Positions whole pixels; alpha in steps of 0.25.

Stack and motion:
- Gap between cards round(0.5 S) smooth / 2 sc crisp; cards keep `pad = max(2, 0.6 × gap)` px from any UI rect.
- Entrance 380 ms: slide = back-out ease clamped at the rest spot (no overshoot past it) from beyond the edge, opacity ×3 faster (a card placed beside a blocking rect fades in where it rests); pop = scale 0.6 → 1 with overshoot; fade = opacity + 10 px drift. Exit 300 ms: slide back 60 % with ease-in, opacity ease-out; the leaving card's slot collapses with ease-in.
- Reflow spring k = 380 s⁻², damping 0.82 of critical (~250 ms, slight overshoot); a UI rect that appears over a card: the card steps out at once; a slot that jumps by more than one card (or changes x): vanish, fade in at the new slot over 140 ms; a rect clipping the column's inner side by ≤ 2 px past the gap: the card shifts toward the edge (≤ half the margin); stack order is enforced every step (a card never slides into the next).
- Merge punch: 60 ms ease-out up, 260 ms damped wobble; badge scale +32 %, card wash 16 % accent, crisp badge hops 1 px.
- Queue: hold × 0.65 while 1–2 wait, × 0.45 while 3+ wait, never under 1100 ms; at most 24 waiting (oldest `info` dropped first).
- Hidden for lack of room: gone at once if a UI rect covers the card, otherwise 150 ms fade; timer frozen; re-enters with its entrance.

## 6. Common mistakes (symptom → fix)

| Symptom | Fix |
|---|---|
| A card covers the HUD, minimap or a window | Add that rect to `uiRects()`, in logical px, only while it is drawn |
| Cards never appear, or appear only after a menu closes | `update()` is not called in that scene; call it at the top of the fixed step for every scene |
| Cards appear and never leave | `update(0)` or no update while the game runs; pass the real step in ms |
| Dozens of identical cards, or a badge counting up every frame | `push` sits in a per-frame check; move it to the code that changes the state |
| Two messages for one event | The game's own one-line notice is still drawn; stop drawing that line, keep its variables |
| The game's "WAVE CLEARED" / "VICTORY" heading is gone | Phase banners, titles and result screens are not notices: restore them and pass their rects |
| Cards hide the party on a small battle screen | Return the party's formation box from `uiRects()`, or choose an edge over empty background |
| The quest card reappears on every kill | Push quest progress only when its count changes, one fixed key per quest, `count: 0` |
| Toasts tiny or huge, or blurry on a pixel game | `bounds` is the backing store, not the logical screen; or set `render: 'crisp'` |
| Quest progress stacks "×2", "×3" | Push quest progress with `count: 0` and a fixed `key` |
| Cards drawn under the HUD or inside the camera | Call `draw` last, in screen coordinates, after undoing the camera translate |
| `?auto=1` ends differently | A push changed game state or used the game's random numbers; toasts must only read |

## 7. Acceptance moments

1. **Single event** (demo `?t=1700&freeze=1`): one card in the corner below the minimap, label + title + icon, timer line partly drained.
2. **Merge** (`?t=2900&freeze=1`): "Moonherb ×3" and the quest card reading "3 / 5 collected"; one card each.
3. **Achievement** (`?t=3950&freeze=1`): gold rim, sheen crossing the card, sparkles around the trophy badge.
4. **Queue** (`?t=6900&freeze=1`): three item cards and "+2 more"; nothing touches the minimap or the hotbar.
5. **Edges and themes** (`?edge=bottom-left&theme=ink`, `?theme=frost`, `?enter=pop&edge=top`): same events, same rules.
6. **Crisp** (the strip): bitmap fonts, pixel icons, no blur, on a 256 × 144 canvas.
7. **Host**: a window (shop, pause) opens over the stack → cards vanish and return after it closes; `?auto=1` ends exactly like the original.
