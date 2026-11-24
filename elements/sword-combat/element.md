# A-05 Real-time sword combat

## 1. What it is

Real-time melee on a top-down map. The hero swings a sword in 4 (or 8) directions; each swing has anticipation, active and recovery frames, and its hitbox is an arc that sweeps from one side to the other over the active frames, so an enemy is struck on the frame the blade actually reaches it. Tapping again near the end of a swing (or right after it) chains a 2-3 hit combo; the third hit is a wider, longer-reaching finisher with double damage and stronger knockback. Struck enemies flash, slide back with friction and puff when defeated, sometimes dropping hearts or gems. When the hero is hit (by a body, a charge or a projectile) it is knocked back and flickers half-transparent for the invulnerability frames, during which nothing hurts it. Enemies are small reusable state machines: **wander** (idle and walk, turn at walls), **chase** (home in once the hero is in sight, detour around walls, back off after a bite), **charge** (line up on an axis, shake with a mark and a lane on the floor, rush, stunned on a wall), **shooter** (keep a distance band, strafe, draw an aim line, fire) and a **warden** boss (38 HP) that mixes telegraphed charges and aimed volleys (only from 48 px or more), is stunned 45 frames on a wall and then backs off to the room centre, shoves a hero who crowds it, and rages below half HP (red pulse, faster, shorter stuns, 5-shot volleys, a double charge). Hearts show HP.

It is a system element: the module owns swings, hitboxes, enemies, projectiles, knockback, i-frames, drops, sparks and hearts, and an autopilot that dodges by danger along its path. The game owns its map and walls, the hero object and its walking, scenes, quests, dialogue and HUD.

## 2. Default parameters

| Key | Default | Range | Meaning |
|---|---|---|---|
| `dirs` | 4 | 4, 8 | swing directions (the held direction at the press, else the facing) |
| `antic` | 4 | 0–12 | anticipation frames (blade pulled back, glint on the last) |
| `active` | 4 | 1–10 | active frames: the arc sweeps over them, hits land here |
| `recover` | 10 | 2–24 | recovery frames (cut to `link` = 3 when the next hit is buffered) |
| `combo` | 3 | 1–3 | hits in the combo; the last is the finisher (+2 antic, +1 active, +6 recover, +4 reach, +60° arc, ×2 damage, ×1.5 knockback) |
| `buffer` | 12 | 0–20 | a press in the last N frames of a swing is kept for the next hit; `grace` 12 frames after a swing also continue it |
| `reach` | 22 | 12–36 | blade reach from the hero's feet-box centre, px |
| `arc` | 150 | 60–360 | swept angle, degrees |
| `knockback` | 3 | 0–6 | initial knockback speed, px per frame (enemies × their weight; the hero × 1.2) |
| `friction` | 0.8 | 0.5–0.95 | knockback speed multiplier per frame (3 px at 0.8 ≈ 15 px in total) |
| `iframes` | 60 | 0–120 | hero invulnerability after a hit, frames |
| `hitstop` | 4 | 0–10 | hit-stop frames (killing blows and finishers ×2; the hero being hit +2) |
| `telegraph` | 24 | 8–48 | charge telegraph frames (shooters aim for 75 %, the warden +8) |
| `enemySpeed` | 1 | 0.5–2 | multiplier on every enemy's walking and charging |
| `hearts` | 3 | 1–10 | hearts when the module keeps HP (2 HP per heart) |
| `overlay` | off | off, on | debug hitbox overlay |

## 3. Variants

- **Classic 4-way** (defaults).
- **8-way flurry**: `dirs` 8, antic 2, active 3, recover 6, arc 120: fast and diagonal.
- **Heavy blade**: antic 8, active 5, recover 16, reach 28, knockback 5, hitstop 7, combo 2: slow, weighty.
- **Single swing**: combo 1.
- **Hitbox lab**: overlay on, enemies at half speed.
- **Hard mode**: enemies ×1.5, telegraph 14, i-frames 30, 2 hearts.

Shown with the same module: the demo (arena lab with a spawner and a frame-data timeline), the starter Thornvale (four rooms, boss) and the unseen top-down quest host, whose separate battle screen was replaced by fights on the map (`checks/hosts/topdown/`).

## 4. Interface

**Needs**
- A fixed 60 Hz step; the hero's feet box `{x, y, w, h}` in world px; a wall test `solid(x, y, w, h)` in the same px; held directions and an attack press per step (latched on keydown).
- Enemy spawns `{id, brain or look, x, y, hp}` from the game's rooms; `clear()` on a room change.
- Optional: the game's own HP (`hp: {get, set, max}`), enemy art (`art`), one hit-stop gate (`onHitStop`), custom behaviours (`brains`).

**Provides**
- `onHit(ev)` / `beforeHit(ev)` for every HP change (`kind` melee | contact | charge | projectile | host, `strength` light | heavy | finisher, `at`, `dir`, `killed`, `hpBefore`, `hpAfter`), `onDefeat`, `onPlayerDown`, `onPickup`, `onEvent` (swing, telegraph, charge, wall, aim, shoot, parry, drop, pickup, defeat, down).
- `canMove()`, `pose()`, `playerAlpha()` for the game's walking and hero sprite; `anchor(id)`, `uiRects()`, `sprites()`, layered `draw()`, `drawHearts()`.
- `autopilot({next})`: input that fights and dodges by scoring the danger met along each candidate path.

**Delivery (v1).** `module/sword-combat.js` (one global, `GameDNA_SwordCombat`; API in `module/README.md`). Colours through `GameDNA_Skin` when loaded, else a built-in pixel16 palette. Robust to sloppy integration: the player may be an object or a getter; host callbacks are wrapped (one warning each); `update`/`draw` never throw; unknown brains fall back to wander; enemies spawned inside a wall are pushed out; a watchdog frees any enemy that asks to move but stays put for 45 steps; bounds hold enemies and shots but never the player (room exits).

## 5. Screen rules (exact numbers)

Native canvas 256×224 in the demo and starter (16 px HUD, 16 px tiles), integer-scaled, whole pixels.

- **Swing**: blade drawn from 3 px to `reach − 2` px from the hero's centre (4 px above the feet-box centre): 3 px ink outline, 1 px steel with alternating highlight, gold guard at 6 px, brown grip. Anticipation pulls it back 0.35 rad behind the arc's start, with a white 5×5 glint on its last frame. Active: the trail is a band of 2×2 dots over the swept angle (edge colour cold blue, gold for the finisher; white core), alpha 0.25 → 1 from the start to the blade; it fades over the first 4 recovery frames; the blade disappears after 5 recovery frames.
- **Hit**: 5 sparks (8 for finishers and kills: gold/white), enemy white for 3 of 6 flash frames, alpha 0.55 on alternate 2-frame blocks during its 6 i-frames, knockback `knockback × weight` px/frame decaying by `friction`, stunned 14 frames (bosses 6).
- **Hero i-frames**: alpha 0.4 on alternate 4-frame blocks for `iframes` frames, 1 otherwise; never 0.
- **Defeat**: a 12-dot ring expanding from 0.4 to 1.4 × the sprite's half size over 16 frames plus 6 puffs; the sprite fades over 22 frames.
- **Telegraphs**: one drawer for both: 2×2 squares (hot, gold on the off-beat) on a 4×4 ink backing every 6 px, alpha 0.9 / 0.55 blinking every 4 frames, drawn on the floor under the sprites. Charge lane: from 8 px out to the wall. Aim line: from 10 px out to the hero (max 130 px), ending in a 9×9 ink-backed reticle. The charging enemy shakes ±1 px and glows white at alpha 0.45 every other 4 frames; a 3×4 + 3×2 exclamation mark 9 px above its sprite (red for charges, gold for aims).
- **Projectiles**: radius 3 (orbs 4), ink outline, hot (orbs cold) fill, 2×2 core blinking white/gold every 4 frames, 1 px shadow 3 px below.
- **Drops**: pop 6 px up over 12 frames, then bob 1 px every 16 frames; blink for the last 120 of 600 frames (hearts, gems; other kinds never expire). Heart 9×9 with ink outline, half hearts filled on the left 4 columns.
- **Hearts HUD**: 9 px apart, 10 per row.
- **Boss**: HP bar 28×2 (ink frame) 5 px above its sprite (15 px while a mark shows), moved under its feet when it would touch the hero's sprite or leave the field; it pulses hot while raging, and the sprite carries a red overlay at alpha 0.28 / 0.45 alternating every 8 frames.
- **Overlay**: hero hurtbox (feet box + 6 px up), enemy hurtboxes (green, grey while invulnerable) and feet boxes, projectile boxes, the live swept sector filled at alpha 0.35.

## 6. Common mistakes (symptom -> fix)

- A quick tap never swings -> the game reads the held attack key in the step; latch it on keydown and clear it after the step reads it.
- The hero swings while talking, or the talk key never talks -> skip `update()` while a dialogue is open; try talk/open first, swing otherwise.
- The hero disappears after a hit -> the old blink sets alpha 0; use `playerAlpha()`.
- The hero takes damage on every frame of a contact -> HP is changed outside the module; let `onHit` / `hp.set` do it (i-frames live in the module).
- Enemies walk through walls -> `solid` receives screen px or ignores some tiles; it takes world px.
- Enemies pile up at a doorway forever -> `bounds` excludes the room; give the room rect (the player is never held by `bounds`).
- Autoplay walks into projectiles or stands next to an enemy -> it still follows the old route; feed the waypoint to `autopilot()`.
- Two hit-stops (the game's and the module's) -> pass `onHitStop` to the game's single gate.
- Nothing moves in `?t=&freeze=1` shots -> `update()` runs only in the animation-frame loop; call it from the shared fixed step.
- A defeated counter or quest never advances -> the old battle screen did it; move it to `onDefeat`.

## 7. Acceptance moments

Demo (`demo/index.html`, autopilot and auto waves; shots in `shots/`):
- **Swing** `?t=6000&freeze=1` (`canvas-demo-swing-t6000.png`): swing 2 in its active frames, blade and cyan arc trail; the timeline's playhead in the HIT 2 row (`demo-page-t6000.png`).
- **Finisher** `?t=6250&freeze=1`: gold, wider arc, FINISHER in the HUD.
- **Charge telegraph** `?t=5500&freeze=1`: a boar shaking under a red mark, its lane of outlined squares to the wall.
- **Aim telegraph** `?t=8750` / `?t=15000&freeze=1`: an archer's outlined aim line ending in a reticle on the hero.
- **Boss telegraph** `?t=17750&freeze=1`: the warden's lane, its HP bar above the mark.
- **I-frames** `?t=9500&freeze=1`: the hero at 0.4 alpha after a hit, still visible.
- **Hitbox lab** `?t=8250&freeze=1&overlay=on`: the red swept sector, green hurtboxes, the hero's box.
- **Hard** `?t=20000&freeze=1&enemySpeed=1.5&telegraph=14&iframes=30&hearts=2`: two hearts, the warden's HP bar inside the field.

Starter (`?seed=11`): title with emblem and the sparring loop (`?t=1200&freeze=1&auto=0`); the Wood fight (`?t=20000`); the Warden charging (`?t=56000`), stunned under combos (`?t=57500`), telegraphing (`?t=61000`) and raging, red (`?t=62500`); THE VALE IS SAFE with the shrine burst (`?t=70000`). A player who never dodges loses.

Unseen host: fights on the map with the old battle screen never entered (`integration-topdown-fight-t10500.png`), quest complete under `?auto=1` (`integration-topdown-auto-end.png`).
