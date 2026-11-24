# bark-bubbles.js (H-05 module, v1.3.1)

One plain script, no dependencies, no `import`/`export`. It defines one global, `GameDNA_BarkBubbles`. Paste it into a `<script>` tag or load it with `<script src>`, without changing it. It owns everything about bark bubbles: picking a line for an event, cooldowns, idle chatter, the bubble shapes per tone, the typewriter reveal, the pop-in and fade, following the speaker, placement (clear of other bubbles, units and UI rects, inside the screen, with an edge pointer for a speaker near or past the border), and drawing (smooth vector bubbles on HD canvases, crisp pixel bubbles with a built-in 6×8 bitmap font on native pixel canvases). It never pauses the game and never reads input.

## API

`GameDNA_BarkBubbles.create(options)` returns an instance.

| option | meaning |
|---|---|
| `bounds` | The visible play field `{x, y, w, h}` in **screen** px of your logical canvas (e.g. below a HUD strip), or a function returning it. Bubbles stay inside it. Without it: the canvas size seen at the last draw. |
| `getAnchor(id)` | `{x, top, w, h}` in **screen** px (world minus camera, plus any HUD offset): the speaker's sprite centre x, the top of its head (include a hat or hover), sprite size. Return `null` when the speaker no longer exists: its bubble then fades out at the last known spot. |
| `getObstacles()` | Rects `{x, y, w, h}` in screen px. Unit sprites carry their `id` (bubbles avoid other units, and their own speaker's body); rects **without** `id` are UI (HUD panels, message boxes, menus): never covered, and a bubble that has no free spot hides until the UI rect goes away. `soft: true` = avoid when there is room; `hard: true` = avoid as strongly as UI but never hide for it (e.g. the player sprite in a crowded melee). |
| `speakers()` | Optional. `[{id, voice}]` of characters allowed to chat on their own (on-screen NPCs). Every `idle` ms one of those that is on screen and quiet barks an `idle` line. Return `[]` to stop idle chatter (cutscene, battle screen). |
| `lines` | Optional. `{voice: {event: [lines]}}`, merged over the built-in table (voices `villager`, `guard`, `merchant`, `hero`, `monster`, `critter`). |
| `params` | See the table below. |
| `onBark(info)` | Optional: called when a bubble appears, `{id, speaker, text, tone, event}` (e.g. for a voice blip). |
| `font` | Optional CSS font family for smooth bubbles, e.g. `'"Nunito", sans-serif'` (load the font yourself). Default: a rounded UI stack (Nunito / Baloo 2 / Quicksand if your page has them, then Arial Rounded, then the system UI font). |
| `skin` | Optional `GameDNA_Skin` id or object: a pixel skin selects crisp bubbles; `palette: 'skin'` takes `paper`, `ink`, `fx.crit`, `fx.hot`. Without it the module draws its own look. |

| param | default | range | meaning |
|---|---|---|---|
| `size` | 0 (auto) | 0–28 | Text px. Auto: smooth = bounds width / 46 (14 at 640), crisp = the 8 px bitmap font × round(width / 400) (×1 at 256). |
| `width` | 20 | 8–40 | Line length in characters before wrapping; at most 4 lines, a longer line ends in `…`. |
| `cps` | 45 | 0–120 | Typewriter characters per second; 0 = all at once. |
| `read` | 55 | 20–120 | Hold time per character after typing (ms). |
| `hold` | 1500 | 600–4000 | Minimum hold (ms). Life = 260 + typing + max(hold, chars × read). |
| `max` | 0 (auto) | 0–8 | Bubbles at once; auto = 3 on fields ≤ 400 px wide, else 4. |
| `cooldown` | 4000 | ms | `bark()` of the same event by the same speaker within this time is ignored. |
| `idle` | 7000 | 0–12000 | Mean time between idle lines from `speakers()`; 0 = off. |
| `stagger` | 600 | 0–2000 | After one speaker barks an event (`spotted`, `hurt`, ...), the same event from other speakers is dropped for this long, so a pack noticing you at once gives one voice. 0 = off; an explicit `cooldown` in `bark()` skips it. |
| `palette` | light | light, dark, parchment, skin | Bubble colours (parchment: tan paper with grain and a burnt rim, brown ink, serif text). |
| `render` | auto | auto, smooth, crisp | auto = crisp when drawing 1:1 on a canvas ≤ 512 px wide, smooth otherwise. |
| `pop` | 0.5 | 0–1.5 | Pop-in overshoot. |
| `edge` | pointer | pointer, hide | Speaker off screen: pin the bubble to the border with a full arrow tail pointing at it (the body keeps the arrow's length inside the field, and the arrow pulses gently), or hide it. |

| method | |
|---|---|
| `bark(id, event, {voice, tone, text, cooldown, priority, ms})` | An event happened to speaker `id`: picks a line of `voice` for `event` (deterministic rotation, no `Math.random`), with the event's tone. Respects `cooldown`, so calling it every frame is harmless, but call it on the **change** (just noticed, just hit). Events: `idle`, `greet`, `spotted`, `lost`, `hurt`, `lowhp`, `kill`, `heal`, `taunt`, `flee`, `thanks`, `win`, `wonder`, `secret` (or your own, with `lines`). Returns the bubble id or `null`. |
| `say(id, text, {tone, priority, ms})` | An exact line. Tones `talk`, `shout`, `alarm`, `hurt`, `whisper`, `think`. A speaker has one bubble: a new line replaces the old one in place. |
| `update(dtMs)` | World time, in your fixed step. `0` while the world is frozen. All motion and timing depend only on this clock. |
| `draw(ctx, offsetX = 0, offsetY = 0)` | After sprites and effects, before the HUD and windows, in screen coordinates (inside a `translate(-camX, -camY)` pass `draw(ctx, camX, camY)`). Any canvas transform is fine (HD backing stores are detected). |
| `silence(id?)`, `clear()` | Fade one speaker's (or every) bubble; `clear()` drops all at once (new game, scene change). |
| `setParams(o)`, `count()`, `active()`, `rects()`, `lastDrawn()`, `time()` | `rects()` = drawn bubble rects for other overlays; `lastDrawn()` = `{id, speaker, text, tone, x, y, w, h, body, tip, pointer, clamped, alpha}` per drawn bubble. |

Event → tone: `spotted`/`alert` alarm (yellow, "!" badge, high priority); `hurt`/`lowhp`/`flee` hurt (pink, red impact ticks, shake, high priority); `kill`/`taunt`/`win` shout (starburst over a coloured burst, heavy capitals); `lost`/`wonder` think (cloud); `secret` whisper; the rest talk. When the screen is full, idle chatter and talk wait; alarm and hurt replace the weakest bubble.

## Integration (15 lines)

```js
// <script src="bark-bubbles.js"></script> before your game script
const barks = GameDNA_BarkBubbles.create({
  bounds: { x: 0, y: HUD_H, w: VIEW_W, h: VIEW_H - HUD_H },                                     // screen px
  getAnchor: id => { const u = unitById(id); return u ? { x: u.x - cam.x, top: u.y - u.height - cam.y + HUD_H, w: u.width, h: u.height } : null; },
  getObstacles: () => units.map(u => ({ x: u.x - u.width / 2 - cam.x, y: u.y - u.height - cam.y + HUD_H, w: u.width, h: u.height, id: u.id })).concat(hudRects()),
  speakers: () => scene === 'map' ? npcs.map(n => ({ id: n.id, voice: 'villager' })) : [],
  params: { cps: 45, idle: 7000 }
});
function damage(target, n) { /* ...existing HP code... */ barks.bark(target.id, 'hurt', { voice: voiceOf(target) }); }
function onNotice(enemy) { if (!enemy.wasChasing) barks.bark(enemy.id, 'spotted', { voice: 'monster' }); }
function step(dt) { /* world */ barks.update(paused ? 0 : dt); }
function render() { /* ground, sprites, effects */ barks.draw(ctx); /* HUD, windows */ }
// new game / switching to another screen: barks.clear();
```

Call `barks.draw` once per frame, unclipped. Bark on **transitions** (an enemy that starts chasing, a hit that lands), never on a per-frame condition alone; cooldowns are a safety net, not the trigger. Give UI rects (HUD panels, the dialogue box while open, menus) without `id`; when a character opens a real dialogue window, `barks.silence(id)` so the same line is not shown twice.

## What it guarantees

- A bubble appears on the frame it is said, above its speaker, pops in from its tail tip (0.55 → overshoot → 1 over 300 ms, with a squash, stretch and a small rock that settle by 500 ms), types its text (each new letter rises into place), holds for the reading time, then fades and rises over 240 ms. It never pauses the game or takes input.
- The bubble is stored relative to its speaker's head: it follows a walking speaker and the camera exactly; when it has to move to a new slot it glides there (100 ms ease).
- A big bubble over a small unit counts by how much of the **unit** it hides, so it moves off a character's head even when that is a small part of the bubble; give the player's rect `hard: true`. A tail tip or an off-screen pointer never sits under a UI rect: such spots cost extra, and a tail that would still end under one is not drawn. Hurt ticks use the top corner where no other unit stands.
- Placement every update: above (centred, left, right, higher), then beside the head, then up and out to a side; the cheapest spot avoids other bubbles (with a gap), UI rects, other units and the speaker's own body, and stays inside `bounds`. Bubbles never overlap each other while there is room; low-priority chatter with no room left ends early.
- A speaker past the border: the bubble is clamped inside the field with room for a full, larger arrow tail that points at the speaker. More than 0.6 field widths away: hidden until the speaker returns.
- Speaker gone (`getAnchor` returns `null`): the bubble finishes at the last known spot. Never at the field centre.
- No inner outline ever shows through a translucent fill (dark, whisper): cloud and starburst shapes are built on an offscreen layer (doubled outline, interior cut out, then filled) and composited once. Crisp bubbles always draw with opaque colours.
- Look: smooth bubbles are cel-shaded (ink edge, lit face with a shade crescent along the bottom, a rim light on the top-left, a drop shadow) with a curved tail; off-screen pointers add a pulsing chevron. Crisp bubbles are built per pixel: a 1 px ink outline around body and tail, a lit top row, a shaded bottom row, a 1 px drop shadow.
- Crisp fades never blend: a crisp bubble pops as a small seed, then full size one pixel high, then rests; it ends by dropping one pixel, then is gone (no half-alpha grey ghost on pixel art).
- Deterministic: same `update` calls, same pixels. No `Math.random`, no wall clock, no network fonts.
- Never throws from `bark`, `say`, `update` or `draw`; bad callbacks are tolerated (one console warning each).
- Cost: see `checks/visual-pass-notes.md` (v1.3 paints each smooth bubble on an offscreen layer every frame; crisp sprites, text rasters and text widths are cached).
