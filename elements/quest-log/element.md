# H-03 Quest log & objectives

## 1. What it is

The quest layer of 2020s adventure games. Quests are data: a title, a giver, a description, a reward and ordered steps, each step "type:target" with a count (`collect:moonherb` x3, `kill:slime` x3, `reach:shrine`, `talk:maren`). The game only **reports what happened** (`event('kill', 'slime')`) and the module advances the right step: only the current step of an active quest counts, a counter never passes its target and never goes down, leftover does not spill into the next step, a quest started by an event does not count that same event, and events after completion change nothing.

The player sees a **tracker** in a HUD corner: one glass card per tracked quest (main quests in gold, side quests in blue), a diamond and the title, the current objective with a checkbox, a counter ("2/3") that punches when it moves and a thin bar that grows. When a step finishes, its box fills and ticks, the text dims and a strike line draws across, it holds for a moment, then collapses while the next objective fades in. A finished quest flashes a sheen, shows COMPLETE, then slides out and its card's slot closes. When the player, an obstacle or an objective marker sits under the tracker it moves to a free corner (cross-fade 220 ms); only its panel ever fades, never its text. **Banners** ("NEW QUEST", "QUEST COMPLETE" with the reward) open from the centre with flourishes, or go to C-14 toasts when the game has them. The **quest log** (one key, or a tap on the tracker) dims the play view, never the HUD, and shows active and done tabs, the list with tracked pins, and the selected quest's giver, description, steps (done ones checked, later ones hidden or shown) and reward; arrows select, confirm tracks / untracks. Optional **world markers**: a bobbing diamond over the current target, an arrow on the view edge when it is off screen.

It never covers the HUD rects the game names: the tracker slides past them, then tries the other corners, then shrinks to one compact line, then hides; banners look for free space clear of the HUD, the tracker, the player and any `obstacles()`; markers that would land on the HUD are skipped. Text never overlaps: every line is measured, wrapped (two lines max, then an ellipsis) and placed in its own box. HD canvases get smooth glass cards and system-font text; native pixel canvases (view <= 512 px wide) get crisp cards with a 1 px outline, built-in 6x8 and 5x6 bitmap fonts and pixel icons, whole-pixel motion and stepped fades.

## 2. Default parameters

| key | default | meaning |
|---|---|---|
| `corner` | `tr` | `tl`, `br`, `bl` |
| `max` | 2 | quests in the tracker (1-4); a new main quest pushes a side quest out |
| `width` | 0 | auto: HD 22 % of the view (at least 12.5 text sizes, at most 50 %); crisp 27 % (84-116 px); else the share given |
| `dodge` | `on` | move to a clearly free corner (nothing within 6 % of the view) once the player, an `obstacles()` rect or an on-screen objective marker / target has been under the tracker for 450 ms; at most one move per 1.8 s; home again after 2.5 s clearly free; with no free corner only the panel fades to 70 % (text stays full) |
| `size` | 0 | auto text px = view width / 50, clamped 11-16 (HD); crisp bitmap scale 1 |
| `theme` | `dusk` | `parchment` (warm paper, dark ink), `skin` (GameDNA_Skin colours) |
| `markers` | `on` | diamond over the current target, edge arrow when off screen (needs `camera` and `locate` or `step.at`) |
| `banner` | `on` | own NEW QUEST / QUEST COMPLETE banners (C-14 toasts instead when `toasts` is given) |
| `log` | `on` | the quest log panel |
| `future` | `hidden` | later steps in the log: `. . .`; `shown` lists them |
| `keyHint` | `J` | keycap on the first card; `''` hides it |
| `hold` | 1100 | ms a finished step stays checked before it collapses |
| `bars` | `on` | progress bar under counted objectives |
| `render` | `auto` | `crisp` when the view is <= 512 px wide, else `smooth` |

## 3. Variants

- **Adventure tracker**: top right, two quests, dusk glass, markers on.
- **Storybook**: parchment, top left, one quest.
- **Checklist only**: no markers, no banners, three quests.
- **Pixel host**: crisp, one quest (a 256 x 224 screen has room for one card beside a top bar).

## 4. Interface

**Needs**: `quests` data; optional `quiet()` (true while someone talks: banners wait); `start(id)` and `event(type, target, n)` from the code that decides each event; `view` (the play view in the coordinates `draw` gets) and `safeRects()` (HUD rects now, dialogue boxes while open); `update(dtMs)` every fixed step in every scene; `draw(ctx)` last. Optional: `camera()` + `locate(target)` or `step.at` (markers), `player()` (reach steps, banners off the player, tracker fade), `obstacles()` (other sprites to keep visible), `toasts` (C-14), `frame(ctx, rect, 'log')` (painted frames), callbacks `onStart` / `onProgress` / `onStep` / `onComplete`.

**Provides**: the drawn tracker, log, banners and markers; `input(action)` / `tap(x, y)` / `hit(x, y)` for the log; `busy()` while the log is open; quest queries (`quest`, `current`, `active`, `isDone`), `save` / `load` / `reset`; `rect()` / `rects()` (UI rects for other overlays); `state()`, `lastDrawn()` (cards with their rows, every text box, banner, markers, log) and `stats()` (applied and ignored events by reason) for checks and judges.

## 5. Screen rules (exact numbers)

HD (S = text px, auto view width / 50 clamped 11-16):
- Card: padding round(0.7 S), row gap round(0.42 S), radius 0.55 S, drop shadow blur 1.1 S, accent strip max(2, 0.22 S) px, accent wash 16 % fading over 60 % of the width, 1 px light rim. Title `750 S px`; objective `520 0.95 S px`; counter `700 0.92 S px` right aligned; labels `800 max(9, 0.72 S) px` letter-spaced. Checkbox 0.95 S. Bar max(2, 0.2 S) px under the text.
- Margin from the view edge max(6, 1.8 % of the width); 0.4 S clear of every safe rect; cards gap 0.63 S.
- Banner: label 0.78 S letter-spaced in the accent, title `800` 1.6 S (complete) / 1.3 S (new), reward line 0.9 S; dark band fading at both ends; candidate rows at 16 %, 5 %, 30 %, 58 %, 44 %, 72 %, 82 % of the view, centred or beside the tracker.
- Markers: diamond 1.24 S tall, glow 1.5 S, bob 0.25 S on 260 ms; edge arrow 1.7 S chevron on a dark disc, inset 0.9 S + its size from the view edge.

Crisp (k = bitmap scale, 1 on native canvases):
- Card: 1 k outline, two-tone body, 1 k highlight, 2 k accent strip; padding 4 k; 6x8 font (10 k lines) for titles and objectives, 5x6 font for counters and labels; 7 x 7 pixel checkbox / tick; 2 k bar with a 1 k highlight. Alpha in 0.25 steps; completion flashes the strip white 3 times.
- Margin 4 px; 2 px clear of every safe rect.

Narrow views (HD < 520 px, crisp < 300 px, phones): one compact line, at most 18 % of the stage tall: the focused quest's gem, its current objective (ellipsised), the counter and a "+N" chip for the other tracked quests; a tap expands the full cards (the first quest in full, the others as one title line with the counter), a second tap collapses them. Elsewhere titles wrap to two lines; on cards narrower than 15.5 text sizes (112 px crisp) the counter sits under the objective, beside the bar. A finished step shows one line, ticked and struck, without its counter.

Markers: one per target; edge indicator = dark disc (0.72 x 1.5 S) with the quest diamond and a pointer on its rim toward the target; on-screen diamonds are placed first and later indicators slide along their edge (2.3 x their size, up to 3 steps each way) or hide; markers also mark keep-out zones for the tracker.

Log: wide = list (40 %, titles wrapped to two lines) + page, panel height fitted to the tallest page of the tab; narrow = full-height sheet with a "< 1 / 2 >" pager. Pages scroll (two lines per `up` / `down`, then the selection moves) with a scrollbar and, while more is below, a fade and a chevron.

Stability: every banner is shown at most once, at one spot chosen when it opens: the full banner if its spot is clear of the HUD, the tracker, the player, `obstacles()` (speakers) and objective markers right now, else at once a small corner toast; it waits while the game's `quiet()` is true (a dialogue). Once shown it runs its full time and dims to 40 % while a character stands under it; a dialogue starting or a HUD box / the tracker reaching it fades it out in 200 ms (clipped off the HUD) and drops it; the tracker never snaps: any change of its anchor (a HUD box appeared, a corner hop) cross-fades in 220 ms at the new spot, and a hop never lands on a banner. The demo's dialogue box is placed per conversation (always at the bottom; the camera lifts the speakers above it), never per frame.

Motion (module clock only): card in 340 ms (ease-out slide from its edge + fade); counter punch 300 ms (scale +32 %, accent colour); tick 260 ms; strike after 30 % of the tick; hold `hold` ms; collapse 260 ms; next objective fades in from 200 ms to 580 ms; quest done: sheen 900 ms, hold 1700 ms, leave 320 ms, slot collapse 260 ms. Banners 2200 ms (new) / 3000 ms (complete), open 280 ms, fade out 320 ms, queued one after another. With no free corner the panel fades to 70 % while the player stands under it (120 ms); text stays at full strength.

## 6. Common mistakes (symptom -> fix)

| Symptom | Fix |
|---|---|
| Counter never moves | the step's `on` words differ from the `event(type, target)` call (`'slime'` vs `'Slime'`, `'kill'` vs `'defeat'`); use the same words |
| Counter jumps several steps, or counts every frame | `event` sits in a per-frame check (`if (dead)`); call it where the kill / pickup happens, once |
| Kills before the quest was given count | they do not: the module ignores them (`stats().ignoredInactive`); call `start` where the quest is given |
| Tracker over the HP bar or the objective line | that box is missing from `safeRects()`, or given in backing-store px |
| Tracker over the dialogue box | add the dialogue box to `safeRects()` while it is open |
| Banners and check-offs frozen in `?t=` stills | `update` is not in the replayed fixed step |
| Arrow keys move the hero while the log is open | route keys to `input()` first and stop when it returns `true` |
| `?auto=1` ends differently | the integration changed game logic or consumed random numbers; the module only reads |
| Markers in the wrong place | `locate` / `camera` return screen px; return world px |

## 7. Acceptance moments

Demo `demo/index.html` (384 x 216 pixel meadow, HD interface in CSS px; `?ui=pixel` = crisp interface on the native canvas). Each moment's event is listed in `checks/state.json` and verified by `checks/moments.py`.

1. `?t=3400&freeze=1`: Maren finished talking: NEW QUEST banner "A Remedy for Maren" (Gather moonherbs), its tracker card slides in top right; diamonds over the three moonherbs.
2. `?t=5000&freeze=1`: Pell's dialogue box (a safe rect) at the bottom; tracker clear of it and of the HUD.
3. `?t=7000&freeze=1`: side quest accepted: a blue second card; its NEW SIDE QUEST banner waited until both conversations were over (the game reports quiet() while someone talks) and sits clear of the tracker, the hero and the NPCs.
4. `?t=13600&freeze=1`: second moonherb picked: counter punches to 2/3, bar grows.
5. `?t=15000&freeze=1`: third herb: "Gather moonherbs" ticked and struck through above the new "Clear the slimes by the ford 0/3"; the fourth herb was ignored; an edge arrow points to the second pouch.
6. `?t=17100&freeze=1`: second slime struck (the hero swings a held sword with a solid smear; hit flash, puff cloud): 2/3.
7. `?t=20900&freeze=1`: shrine reached (the tracker has moved to the free top-left corner, clear of the hero and the brazier): brazier lit, "Light the shrine brazier" ticked, "Return to Elder Maren" next; side quest moved to "Bring them to Pell".
8. `?t=23600&freeze=1`: quest log open: tabs Active 2 / Done 0, Pell's quest selected, description, steps, reward.
9. `?t=35700&freeze=1`: QUEST COMPLETE banner with the reward; the main card shows COMPLETE; coins 12 -> 52.
10. `?t=40400&freeze=1`: side quest complete (the hero keeps facing Pell through the banner); the main quest card has left.
11. `?t=42600&freeze=1`: a slime event after all quests are done is ignored.
12. `?ui=pixel&t=15000&freeze=1`, `?ui=pixel&t=23600&freeze=1`, `?ui=pixel&t=35700&freeze=1`: the crisp pixel tracker, log and banner.
