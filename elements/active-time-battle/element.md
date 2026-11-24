# A-01 Active-time gauge battle

## 1. What it is

A battle-flow element. Every combatant (heroes and enemies) owns a gauge that fills in real time at a rate set by its speed. When a hero's gauge is full, that hero's command window opens (Attack / Magic / Item / Defend). When an enemy's gauge is full, it picks an action at once. Chosen actions wait in one shared first-in-first-out queue and play one at a time. In **Active** mode the clock never stops, so enemies keep filling and acting while the player is still in a menu. In **Wait** mode the clock stops while any command window is open. Speed, haste and slow therefore decide how often each side acts, and menu speed becomes part of the skill.

It replaces "fixed turn order" in a turn-based battle. It does not change damage, targeting or the menus themselves.

## 2. Default parameters

| Key | Default | Range | Meaning |
|---|---|---|---|
| `speed` | 1 | 0.5–2, step 0.25 | Global gauge speed multiplier (battle speed setting) |
| `mode` | `active` | `active` / `wait` | Whether the clock runs while a command window is open |
| `party` | 4 | 1–4 | Party size |
| `spd1..spd4` | 32, 24, 44, 28 | 10–60 | Hero speeds (enemies in the demo: 18–46) |
| `status` | `none` | `none` / `haste` / `slow` | Party-wide status for the variant toggle |
| `res` | `256x224` | `256x224` / `240x160` | Native resolution (16-bit console / handheld) |
| `enemyGauge` | `on` | `on` / `off` | Draw a small gauge under each enemy |

**Gauge rule (exact):**

- The gauge runs from 0 to 1. Per 60 Hz tick while the clock runs: `gauge += (speed + 20) * mult * statusFactor / 9000`.
- `statusFactor`: haste 1.5, slow 0.5, otherwise 1. Haste and slow cancel each other (setting one clears the other).
- Time to fill at ×1: speed 10 takes 5.0 s, speed 30 takes 3.0 s, speed 60 takes 1.9 s. Haste at speed 30 takes 2.0 s; slow takes 6.0 s.
- At battle start each gauge begins at a seeded random 0–0.55, so the first turns are not simultaneous.
- When the gauge reaches 1 it clamps at 1 and the combatant leaves the charging state:
  - **Hero:** state `ready` and joined to the ready queue (FIFO). The command window opens for the head of the ready queue. A hero who becomes ready while another hero's window is open waits in line.
  - **Enemy:** chooses its action immediately and appends it to the action queue (state `queued`).
- A hero's confirmed command is appended to the same action queue (state `queued`). **Defend** is the exception: it takes effect at once (damage ×0.5 until that hero is next ready), skips the queue, and the gauge restarts from 0.
- The head of the action queue starts when no action is animating. Gauges keep filling during animations in both modes. When the action ends the actor's gauge is set to 0 and it charges again.
- If an action's target died while it waited, retarget to the first living valid target. If the actor died, drop the action.
- A dead combatant's gauge is 0, drawn in the "off" style, and the combatant is removed from both queues.
- **Battle end:** on every death check both sides. When either side has nobody living: set the result, close any open menu, empty the ready queue and the action queue, and stop the gauges. No menu, auto-player choice or target pick may run while either side is empty; every pick from a living-list checks the list is non-empty first.
- A spell-given haste lasts 20 s of battle clock (the clock that stops in Wait mode).

**Clock rule:** `clockRuns = battle not over AND NOT (mode == wait AND a command window, sub-list or target cursor is open)`. While the clock is stopped: no gauge fills, no status timer counts, and no queued action starts. An action already animating finishes. Idle animations, cursors and ambient motion keep running in both modes.

## 3. Variants

| Variant | Params | What changes |
|---|---|---|
| Active (default) | — | Enemies act while you choose |
| Wait mode | `mode: wait` | Time stops in menus; pause bars on the mode plate |
| Hasted party | `status: haste` | Party gauges ×1.5, green fill, rising arrows on the sprites |
| Slowed party | `status: slow` | Party gauges ×0.5, violet fill, falling arrows |
| Fast battle (×2) | `speed: 2` | Everything fills twice as fast |
| Handheld 240×160 | `res: 240x160` | Field 112 px, HUD 48 px, 10 px rows |
| Solo hero | `party: 1, spd1: 50` | One fast hero against three enemies |

A common softer Wait variant stops the clock only in sub-lists and target selection, not on the top command list. Keep it as a third mode if the host game wants it; the demo implements the two modes above.

## 4. Interface

**Kind: system.** `starter/index.html` is a complete game built on the module. `starter/README.md` lists its extension points for addons: the hit site, the draw-effects slot, UI rects, actor anchors, the input chain, autoplay and the world clock.

**Delivery (v1):** all of this is implemented in `module/active-time-battle.js` (global `GameDNA_ATB`; API in `module/README.md`). The host connects it through `create({combatants, isAlive, onHeroReady, onMenuCancel, chooseEnemyAction, performAction(action, done), onBattleEnd})`, calls `update()` every 60 Hz step and `submit()` from its menu, and draws with `layoutRow` / `drawGauge` / `drawEnemyGauges` / `drawModePlate`. The host's tick must run menu input, the current animation, and `update()` on every step, without skipping one because another is active. The demo uses the same module.


**Needs from the host:** a list of combatants (id, side, speed, alive); a fixed 60 Hz tick (convert real time to ticks, at most 250 ms per frame); `startAction(action)` that plays one action and signals when it is done (with a hit frame for damage); an enemy chooser; a command menu that can be opened for a given hero and returns an action or Defend; haste and slow flags.

**Provides:** `gauge` (0..1) and `state` (`charge` / `ready` / `queued` / `acting` / `dead`) per combatant; `heroReady` and `enemyReady` events; the ready queue and the action queue; `clockRuns`.

**Removes from the host:** the round counter and the fixed turn order. Anything that ran "once per round" (poison ticks, regen) moves to the battle clock (for example every 5 s of battle clock).

## 5. Screen rules (exact numbers)

- Native buffer 256×224 (or 240×160), integer scale, `image-rendering: pixelated`, smoothing off. Field 256×150 + HUD 74 px (handheld: 240×112 + 48 px).
- HUD = two bevel gradient windows (blue gradient, 1 px dark outer border, 2 px light bevel top-left, darker bevel bottom-right). Left window 90 px wide (80 handheld): enemy names, or the command window when a hero is up. Right window: hero rows.
- Hero row (16 px rows, 10 px handheld): hand cursor marks the hero whose window is open; name at x+13; HP right-aligned at x+74 (x+66 handheld); gauge from HP+6 to the window's right edge −8 (or to the next text −6, e.g. an MP label), 6 px tall (5 handheld), top = text top + 1, on the same line as the text. At least 40 px wide; if it does not fit, show current HP only rather than moving the gauge under the text. Name, HP, gauge and any MP text occupy disjoint x ranges.
- Gauge drawing: 1 px dark outline `#0a0c24` with clipped corners; empty interior `#1a1c3e` with a darker top row; fill = body colour, 1 px lighter top row, 1 px darker bottom row, and a 1 px dark cap at the fill edge.
- Gauge colours by state: charging gold (`#f6c840` body, `#fff8c8` top, `#c08a18` bottom); haste green (`#a8f060`); slow violet (`#b08af0`); ready = full and flashing, white for 3 of every 4 six-frame phases and gold for the 4th; queued or acting = full cyan (`#6ad8f0`), with a 3 px status-colour tag at the left end when the hero is hasted or slowed, so haste and slow stay visible while heroes wait in the queue; dead = empty with a dotted midline. Every state must be tellable apart in a still frame.
- Optional enemy gauge: drawn in the field pass (so it stays visible while a command window replaces the enemy-name list), 22×4 px centred on the enemy's x, top = foot y + 2, clamped inside the field; red fill (`#f05a50`), yellow when full.
- Mode plate, top-left (4,4), 13 px tall: `ACTIVE x1.0` or `WAIT x1.0` in the module's 5×7 pixel font. In Wait mode while the clock is stopped, the plate turns violet with yellow text, and two 2×7 pause bars follow the text, never covering it.
- Ready hero sprite takes a "ready" stance; the acting combatant gets a small bouncing pointer above its head while it acts.
- Enemy pre-action flash: 18 frames, alternating every 3 frames, white overlay at 40 % alpha (never a pure white silhouette). Hit flash: overlay at 62 %.
- Command window: hand cursor on the current entry; inside a sub-list the hand stays on the chosen entry while the target hand blinks (hidden 1 of every 4 phases of 8 frames). The target hand goes to the left of the target, or above it (pointing down) if there is less than 12 px of room.
- Spell or item name in a banner window at the top centre (y 4, 22 px tall); damage numbers bounce and move below the banner if they would touch it.
- Everything (cursor, plates, banner, pop-ups) stays fully on screen and draws above the field.

## 6. Common mistakes (symptom → fix)

- **Gauges fill in fixed steps or frame-rate dependent speed** → fill per fixed 60 Hz tick from accumulated real time, not per `requestAnimationFrame` call.
- **Several heroes' menus open at once / the second ready hero is skipped** → keep a FIFO ready queue; open one window at a time for its head.
- **Wait mode freezes the whole screen** → stop only the battle clock; idle bob, cursor blink and ambient motion keep running.
- **Wait mode still lets an enemy start its attack while you browse** → the action queue must not start a new action while the clock is stopped.
- **Active mode behaves like Wait: the queue only advances when no menu is open** → the host's tick gated the animation behind `if (menu) ... else if (anim)`. Run menu input, the animation and `atb.update()` every step. (Cold test round 2, all three runs.)
- **Wait mode softlocks: the open menu ignores input while the clock is stopped** → the menu input must not depend on `clockRuns()`; only gauges and queue starts stop. (Round 2.)
- **HP text overlaps names or is drawn twice** → take the positions from `layoutRow()` and draw HP once at `hpRight`. (Round 2.)
- **Full, chosen and charging gauges look the same in a screenshot** → use the four colour states above (gold, flashing white, cyan, off).
- **Two actions animate on top of each other** → one shared action queue, start the next only when the current one reports done.
- **An action hits a target that died while it waited** → retarget at start; drop actions whose actor died.
- **Gauge left full after acting, so the hero acts twice** → reset to 0 when the action finishes, not when it is chosen.
- **Defend waits in the queue behind slow animations** → apply it at once and restart the gauge.
- **Haste looks like nothing happened** → change the gauge colour and draw status arrows on the sprite, not only the number.
- **Fast-forward for screenshots replays from 0 every reset and never ends** → count a global tick separate from the per-battle frame.
- **Game freezes at the end of a wave (TypeError on `living(...)[0].id`)** → a ready hero's menu opened after the last enemy died. Close menus and empty both queues the moment a side is empty; guard every living-list pick. (Cold test round 1, run 2.)
- **Gauge drawn under the HP text, overlapping digits** → place it after the HP text's measured right edge + 6 px on the same line; shorten the HP text if needed. (Run 2.)
- **Enemy gauges drawn in the HUD name list vanish when a menu opens** → draw them in the field pass under each sprite. (Run 1.)
- **Black canvas on load: `clamp is not defined`** → helpers in a closure or module are not global; call them by their qualified name (`RK.clamp`) and check every new identifier is defined where used. (Run 3.)
- **Deleting or renaming a host helper breaks a later caller** → hook existing functions by changing bodies; never delete them; grep call sites.

## 7. Acceptance moments

| Moment | What must be visible |
|---|---|
| `?t=4000&freeze=1` (Active) | A hero's command or sub-list open, while an enemy is mid-action (pre-flash or strike); party gauges in at least three different states |
| `?t=6500&freeze=1&mode=wait` | Command window open, mode plate violet with pause bars; gauges unchanged between two freezes taken while the same window is open |
| `?t=5200&freeze=1&status=haste` | Green gauges and rising arrows on every hero |
| `?t=5200&freeze=1&status=slow&speed=2` | Violet gauges, falling arrows, plate reads `×2.0` |
| `?t=6500&freeze=1&res=240x160` | Same HUD at 240×160 with 10 px rows, nothing clipped |
| `?t=52500&freeze=1` | Victory window that covers no hero |
| 500 px wide window | No horizontal scroll; game at an integer scale above the controls |
