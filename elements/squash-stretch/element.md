# E-10 Squash, stretch & anticipation

## 1. What it is

Procedural deformation of every character the game already draws, with no new animation frames. Before a jump the sprite crouches for a few frames; while it rises and falls fast it gets taller and thinner; on landing it flattens and widens, then springs back past normal and settles (a damped spring with overshoot). Before a swing or a spell it crouches and leans back, then lunges forward with a stretch. A struck actor squashes and tilts away from the blow. A long wind-up (a boss's telegraph) is a growing crouch that is released as a pop. Running leans into the direction with a light stride bounce; standing still breathes slowly.

All of it is one canvas transform about the actor's **feet**: `sy` along the height, `sx = 1/sy` across (the area stays the same, which is what makes it read as soft mass rather than zoom), plus a shear for the lean (also area-preserving). The feet never move. The transform is applied only around the sprite's draw call, so **positions, hit boxes, timing and rules are untouched**: autoplay ends at the same frame with the same result, and the dashed hit boxes in the demo are identical in both halves. Poses advance only in `update(dt)` from the game's fixed step, so `?t=&freeze=1` is deterministic. On pixel games the scale snaps to whole pixels of the sprite; on HD games it stays smooth.

Why it counts as modern (M9 bar): 2020s indie characters are rarely stiff stills; squash, stretch and anticipation (two of the classic animation principles) are what makes a single drawing feel alive, and here they cost nothing in art.

## 2. Default parameters

| Key | Default | Range | Meaning |
|---|---|---|---|
| `amount` | 1 | 0–2 | Scales every deformation |
| `squash` | 0.28 | 0–0.6 | Landing squash at full strength: `sy = 1 - 0.28 = 0.72`, `sx = 1.39`; a hit uses 85 %, a jump's crouch 55 %, an attack's crouch 45 %, a charge up to 60 % |
| `stretch` | 0.2 | 0–0.6 | Air stretch at `maxFall` speed (`sy` 1.2), and the size of the release pops |
| `spring` | 6 Hz | 1–20 | Natural frequency of the spring back |
| `wobble` | 0.55 | 0–0.95 | Overshoot: damping ratio = 1 - wobble (0.45); 0 = no overshoot |
| `lean` | 9° | 0–30 | Shear at full run speed (half in the air); an attack's lunge leans the same toward the target |
| `breathe` | 0.025 | 0–0.1 | Idle breath (period 2.6 s, phase from the id) |
| `walk` | 0.05 | 0–0.2 | Stride bounce while moving, scaled by speed |
| `anticipation` | 70 ms | 0–400 | Crouch before an attack's lunge (a jump's take-off crouch: 60 % of it) |
| `snap` | auto | auto, pixel, smooth | `auto`: pixel when the drawing context has `imageSmoothingEnabled === false` or a pixel skin is passed |
| `reduced` | system | system, on, off | Half amplitude, no overshoot, no breath or bounce |
| `view` | side | side, top | `top`: no air stretch and no auto landing (top-down games) |

Per actor (`attach`): `w`, `h` (drawn size, for snapping), `maxSpeed`, `maxFall` (in the game's own velocity units), and optional `amount` (0–2, multiplies the global amount) and `stiffness` (0–1, cuts only squash and stretch, keeps the lean): a slime at `stiffness 0`, an armoured knight at 0.4–0.6, so they do not flatten alike.

Timeline with the defaults, 60 Hz:

| Event | Frames |
|---|---|
| land (full) | `sy` 0.72 held 3 frames → 0.89 (f5) → 1.03 (f7) → 1.04 peak (f8) → 0.99 (f12) → settled by ~f16 |
| attack | f1–4 crouch to 0.88 and lean back ~8° → f5 lunge 1.05, lean 9° forward held f5–f7 (sy 1.11 at f6–f7) → lean 5° at f9 → back to rest by ~f14 |
| hit (1.0) | `sy` 0.76, tilt away ~8°, held 3 frames → 0.91 (f5) → 1.04 peak (f8) → settled by ~f14 |
| jump (take-off) | `sy` 0.93 → 0.89 (f2) → stretch 1.18 by f6 while rising fast |

## 3. Variants

- **Classic cartoon**: the defaults.
- **Snappy arcade**: `squash 0.22`, `stretch 0.16`, `spring 9`, `wobble 0.35`, `lean 7`, `anticipation 50`.
- **Rubbery**: `squash 0.38`, `stretch 0.3`, `spring 4.5`, `wobble 0.75`, `lean 13`, `breathe 0.04`, `walk 0.09`, `anticipation 110`.
- **Subtle HD**: `amount 0.6`, `breathe 0.015`, `walk 0.03`, `lean 6`.
- **Pixel-snapped**: `snap: pixel` (whole-pixel scale even on a smoothed canvas).
- **Reduced motion**: `reduced: on`.
- **Top-down**: `view: top`.

## 4. Interface

Needs: a fixed step that calls `update(dt)` once (also under `?t=` and `?auto=1`); per moving actor per step `motion(id, vx, vy, onGround)`; optional events at existing sites: attack/cast start (`attack`), accepted damage (`hit` with the blow's direction), long wind-ups (`charge` / `release`); each sprite's draw wrapped by `wrap(ctx, id, footX, footY, fn)` (or `apply` / `restore`).

Provides: the deformation of wrapped sprites; automatic `land` / `jump` from `motion`; `transform(id, ctx)` (for shadows); `stats()` (events by kind, auto land / jump, deepest squash, tallest stretch, strongest lean, volume error, open saves, self-advanced frames). `interfaces.time` is `any` and `coords` `screen`: it needs only draw coordinates and a step, in any view or clock.

## 5. Screen rules (exact numbers)

- Fixed point = the foot point passed to `apply`; it never moves.
- `sy` in 0.45..1.8, shear in ±0.8 (top offset per px of height), clamped whatever the params.
- Smooth mode: `sx * sy = 1` exactly (`maxVolErr` 0). Pixel mode: `round(sy*h)/h`, `round(sx*w)/w`, top offset `round(k*h)` px; feet rounded to whole px. The overall size snaps, but nearest-neighbour scaling still drops or doubles rows inside the sprite (a 1-px eye or visor line can break up during the squash); give detailed pixel sprites `stiffness` 0.4–0.6.
- Per-actor scale: `sy = 1 + d × amount_actor × (1 − stiffness)`, shear × `amount_actor`. Lunge lean held 50 ms (3 frames) before the spring takes it back.
- Scripted poses (hold, anticipation, charge) ease in with a 22 ms time constant; the spring runs in 1/120 s sub-steps (stable for any params in range).
- Hold after land / hit: 50 ms. Release pops: stretch ≈ `stretch × strength`, attack pop × 1.7, charge release × 1.6.
- Only the sprite is inside the transform; shadows, HP bars, names, HUD and effects stay outside (the demo widens its shadows by `sx`).

## 6. Common mistakes (symptom → fix)

- Sprites sink or float when squashed → the foot point was the top-left or the centre; use the bottom centre of the drawn sprite, in draw coordinates.
- The HUD or another sprite is scaled for a frame → `apply` without `restore` on an early return; use `wrap`.
- Autoplay ends differently → game code read `transform()` or a size was changed; the element is drawing-only.
- `?t=&freeze=1` frames differ between runs, or poses play faster at high refresh rates → `update` was called from render; move it into the fixed step.
- No landing squash → `onGround` not passed, or passed before collisions resolved.
- The HP bar wobbles with the enemy → the bar is drawn inside the wrapped function; `restore` before it.
- Half-pixel shimmer on a pixel game → `snap: smooth`; use `auto` or `pixel`.
- HD game snaps poses to whole pixels → the integration turned `imageSmoothingEnabled` off; keep the game's own smoothing (or pass `snap: 'smooth'`).
- Armoured knight flattens like the slime → give rigid actors `stiffness` 0.4–0.6 in `attach`.
- Velocities in px per second but `maxSpeed` in px per step (or the reverse) → permanent full lean or none; use one unit for both.
- An id-less sprite (title screen, preview) → no transform, counted in `badInput`; give it an id.

## 7. Acceptance moments

- Jump (demo `?t=1150&freeze=1`): right half, the knight is tall and thin mid-air; left half, the same still.
- Attack anticipation (`?t=2550`): the knight crouches and leans back; left half unchanged.
- Hit (`?t=2620&boxes=1`): the slime squashed wide and tilted away from the sword; dashed hit boxes identical in both halves.
- Charge and bolt (`?t=4400`, `?t=4670`): the mage crouches and leans back while the gem glows, then the slime flattens under a heavy hit.
- Landing (`?t=1700`, Rubbery params): the knight flattened on the ground, feet on the line.
- Pixel mode (`&mode=pixel`): whole-pixel scaling, no half-pixels.
- Host integrations: side-scroller pixel game (hero leaning while running, landing squash, crawler hit squash), HD top-down (sprout and boss squash on hits, HP bars not deformed); `?auto=1` same end as the original.
