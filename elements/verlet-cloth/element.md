# E-12 Verlet rope & cloth

## 1. What it is

Cloth and ropes that move on their own: a hero's cape trails behind when running and moves to the new back when turning, a scarf or a headband tail flutters, a plume or ponytail bobs, banners and flags fly and ripple on their posts, a rope or a lantern chain sways and swings when struck. Each piece is a handful of points joined by distance constraints, a single strand (rope, chain, scarf, ribbon, hair, tail) or a small 2D grid (cape, banner), integrated with Verlet steps and pinned to an **anchor**: a function the game provides that returns where the piece hangs from (the actor's shoulders, neck, head, a pole top or a beam) and which way the actor faces. Forces: gravity, damping, a drape toward the actor's back, wind that varies smoothly with game time and position (gusts), impulses from swings, dashes or hits, and an extra gust on demand. Collision: a ground line, an optional list of solid rects and an optional body circle the cape drapes over.

The module only **reads** anchors and only **draws**: no position, hit box, timer, RNG or input of the game is touched, so autoplay ends at the same frame with the same result. It runs in fixed 1/120 s sub-steps of game time, so `?t=&freeze=1` gives the same frame on every run. When an anchor jumps farther than the teleport distance between two updates (respawn, restart, room change, a blink), the piece is re-posed hanging from the new anchor at rest: no line is ever stretched across the screen and no falling or flung shape is carried over. Strands can never get longer than 1.3× their rest length; a piece that goes non-finite is re-posed at its anchor.

Drawing is skin-friendly: HD games get filled strips and quads with fold shading (a quad's projected area against its rest area: narrow = in a fold, darker; negative = the back side, `color2`), a lit edge highlight, faint fold lines, a forked tail on scarves and an ink outline. Pixel games (`imageSmoothingEnabled === false`, or `snap: 'pixel'`) get the same shapes rasterised at whole native pixels, three tones, hard alpha and a 1 px ink outline.

Why it counts as modern (M9 bar): older games drew capes and flags as fixed frames; secondary motion driven by real-time physics is what makes 2020s indie characters and scenery feel alive, and here it costs a few dozen points per piece and no art.

## 2. Default parameters

| Key | Default | Range | Meaning |
|---|---|---|---|
| `wind` | 0.5 | -3..3 | Base wind, + blows right; 1 = 220 px/s at scale 1 (a stiff breeze) |
| `gust` | 0.5 | 0..1 | How much wind varies: sum of three sines of game time (periods ~4.8 s, 2.2 s, 13.4 s) with a phase that moves across x, plus a small vertical flutter |
| `stiffness` | 0.8 | 0..1 | Solver iterations = 2 + round(8 × stiffness) per sub-step; correction 0.55 + 0.45 × stiffness; bend and shear weights grow with it |
| `segments` | 8 | 2..24 | Points along each piece (unless `attach` sets its own) |
| `damping` | 0.03 | 0..0.3 | Velocity lost per 60 Hz frame |
| `gravity` | 1 | 0..3 | × 980 px/s² × scale (top view × 0.55; chains × 1.15) |
| `drape` | 0.5 | 0..2 | Push toward the actor's back, × 320 px/s² × scale × kind factor, growing toward the free end |
| `shade` | 1 | 0..1 | Fold shading strength |
| `texture` | 1 | 0..1 | v1.2, HD: brush strokes, soft blotches and rope strands, all fixed in cloth coordinates |
| `look` | painted | painted, flat | v1.2, HD: `painted` = smooth silhouette, fold bands from a light direction (`light` option, default top left), darker back face, length gradient, lit rim, thin edge in a darker hue, trim band, twisted rope; `flat` = the v1.1 flat tones with an ink outline. Pixel mode is not affected |
| `outline` | auto | auto, on, off | auto = on unless a passed skin has `outline.sprite.width` 0 |
| `snap` | auto | auto, pixel, smooth | auto = pixel when the draw context has `imageSmoothingEnabled === false` or a pixel skin is passed |
| `reduced` | system | system, on, off | Wind × 0.4, no gusts, damping + 0.06, flutter × 0.3 |
| `view` | auto | auto, side, top | auto = per piece: top-down when its anchor returns `fx, fy`, side view otherwise. Top-down: capes hang down the screen and stir (no lift or motion air), drape against `fx, fy`; `layer: 'auto'` puts a cape in front when the actor faces up |

Per kind (`attach`): air drag (wind coupling, /s ÷ 6): rope 0.15, chain 0.12, scarf 1, ribbon 1.1, hair 0.7, tail 0.5, cape 1, banner 1.2. Motion air (the share of the anchor's own speed felt as head wind, so a running cape trails whatever the wind; side view only): cape 0.85, scarf 0.7, ribbon and hair 0.5, tail 0.4. Lift (an upward pull ∝ the actor's own speed through the air, on cloth below the pin only, side view only): cape 0.3, scarf 0.8, ribbon 0.4, hair 0.3, tail 0.25. Cloth above its pin (capes, scarves, hair, ribbons, tails) gets an extra pull down and toward the back (700 and 250 px/s² × scale, whatever `gravity` is) and no bending stiffness there, so it slides off the shoulders instead of standing up like an arch. Banners get +0.025 damping so they settle after a gust, and in wind they get light and dark bands that travel out from the pole (± 0.17 × `shade` × flutter of the tone in the painted look, ± 0.2 in the flat look and pixel mode, scaled by the wind across the piece; × 0.3 reduced). `flutter` per piece (0..3; kind default: banner 1, ribbon 0.8, scarf 0.6, cape 0.5, hair 0.25, tail 0.2): travelling ripple strength; the demo's banners use `flutter: 2, drag: 2` to fly more level. Top-down capes: gravity × 0.95, drag × 0.3, drape × 0.4 (they hang and stir instead of flying out like wings). Default size (px at scale 1): rope 40 × 2, chain 40 × 4, scarf 22 × 5, ribbon 24 × 4, hair 14 × 6 (tapers to 15 %), tail 18 × 6, cape 26 × 16 (widens to 125 % at the hem), banner 26 long × 16 tall. Default layer: scarf front, all others back.

Measured in node with the module v1.1 (26 × 16 cape, scale 1, 60 Hz, 2026-11-16; angle of the hem's middle from the anchor): standing in the default breeze facing right 15° (6-23°); running at 200 px/s 46° (40-52°) with the default wind behind it, 55° in still air, 58° into the wind (v1.1.1); top-down (`view: 'top'`, 20 × 16, 156 px/s) 21°. v1.1.2 (the pinned row turns with a cape blown out sideways; angle of the tip, 2026-11-16): standing and running with the wind behind unchanged (−14°, 47°), running in still air 70° (was 55°), into the wind 78° (was 68°), top-down unchanged. The demo's knight cape (60 × 26, scale 1.15, body circle) reads at about 45-60° behind the back while running (`shots/02`). A 300 px blink moves it in one step (snaps 1, max stretch 1.01). An impulse of (-260, -60) px/s throws the hem ~16 px and it comes to rest within ~100 frames (it may settle into a fold up to ~2 px from the old one). Soak (`checks/soak.py`: the demo scene for 120 s of game time under all 7 presets, module v1.1.2): strand clamps 0, resets 0, max stretch per piece ≤ 1.022, cape wholly above its anchor 0 / 7199 frames in every preset (v1.1.1: up to 234 in Silk), pin error 0. Gust: front-facing share of the cape's drawn area 0.70 (v1.1.1: 0.38, an edge-on crumple). Turn before the walk back: the cape's top never above the anchor (v1.1.1: 41 px above, over the helmet). Landing from a jump: the hem of the demo cape is back below the anchor 4-5 frames after touchdown (it was thrown up by the fall; expected physics, drag-limited).

## 3. Variants

- **Breezy (default)**: the defaults.
- **Still air**: `wind 0`, `gust 0` (cloth only moves with the actor).
- **Storm**: `wind 1.8`, `gust 1`, `damping 0.02`.
- **Heavy wool**: `stiffness 1`, `damping 0.08`, `gravity 1.4`, `drape 0.8`, `wind 0.3`.
- **Silk**: `stiffness 0.55`, `damping 0.01`, `gravity 0.7`, `wind 0.7`.
- **Low-cost**: `segments 4`, `stiffness 0.5` (about a third of the points and iterations).
- **Underwater**: `gravity 0.25`, `damping 0.12`, `wind 0.15`, `gust 1`.
- **Pixel-snapped**: `snap: pixel` (whole pixels even on a smoothed canvas).
- **Top-down**: `view: top`.

## 4. Interface

Needs: a fixed step that calls `update(dt)` once after movement (also under `?t=` and `?auto=1`); per piece an anchor function returning world `{x, y, facing}` (top-down `fx, fy`; optional `ground`, `layer`, `alpha`) or `null` while hidden; draw calls beside each actor's sprite (`draw(ctx, 'back', group)` before, `draw(ctx, 'front', group)` after) and in the scenery pass; optional camera offset (`camera`), `ground`, `solids`, and `impulse` at swing / dash / hit starts.

Provides: the drawn pieces; teleport snap; `wind(x, y)`; `tip(id)` for a lantern or bell; `points(id)`; `stats()` (attached, points, constraints, updates, substeps, snaps, resets, hidden, anchorErrors, badInput, maxStretch, maxReach, clamped, collisions, drawErrors, selfAdvanced); `list()` per piece (anchor, pinErr, finite, bbox, maxStretch, reach, maxReach, snaps); `lastDrawn()` (screen rects, owner = group). `interfaces.time` is `any` and `coords` `screen`: it needs only draw coordinates and a step.

## 5. Screen rules (exact numbers)

- Pinned points sit exactly on the anchor (+ the piece's pin offsets: a cape's top row spans `width` centred on the anchor; a banner's pinned column runs `width` down the pole from the anchor). `pinErr` 0.
- Side-view cape thrown out sideways (gust, run, turn): once the middle of the cape is more than ~50° from straight down, its pinned row turns with it (up to 0.85 × the angle, eased, about 80 ms to follow), so a cape blown out flat shows its width like a flag instead of an edge-on crumple; hanging or swinging within ~50° it is unchanged. `pinErr` is measured against the turned row.
- Side-view turn-around (`facing` flips): the cape is mirrored onto the new back with the sprite (columns swapped so none twists, half its speed kept) instead of whipping over the head from the old back.
- Solver: 2 + 8 × stiffness passes over all links per sub-step, then up to 24 extra passes over the strands only while any strand is over 4 % long (an anchor that jumps on a turn, a big impulse, a gust), so strands stay within ~2 % of rest. Strand clamp (safety net, `stats().clamped`, 0 in the soak): no along-segment longer than 1.3 × rest after a sub-step. Across and shear links of a grid resist stretching only, down to a floor (then pushed back to the floor, not to full length): capes 55-75 % (they keep their spread over the shoulders), banners 15 % in still air rising to 50-70 % in a breeze (a flag held open by the wind keeps its height, in still air it hangs limp).
- Body circle (`body`): side view = a half-disc on the actor's back below the circle's centre: points inside it are moved straight to its back edge; points above the centre are never held, so a cape thrown up by a jump falls back down. Top-down: a full circle, radial push.
- Ground: a `ground` line above the anchor or farther below it than the piece can reach is ignored (an actor falling into a pit, a screen-bottom line).
- Reset: a piece with a non-finite point, a strand over 3 × rest, or a point farther than 1.5 × (1.3 × length + 1.2 × width + 2) from the anchor is re-posed at rest (`resets`).
- Teleport: an anchor move over `teleport` px between two updates (auto: max(1.25 × length, 36 × scale)) re-poses the piece hanging from the new anchor at rest (`snaps`). A hidden piece (anchor `null`) shown again farther than that from where it was hidden starts in its rest pose.
- Sub-steps: 1/120 s, at most 12 per update; anchors are read once per update and interpolated across its sub-steps.
- Smooth drawing: Catmull-Rom ×3 along strands, quads overdrawn by a 0.7-device-px hairline of their own colour (no seams), outline width 1.25 × scale native px (or the skin's), drawn as a thick stroke under the fills. Pixel drawing: rasterised at 1 native px (or 1 device px when the context is scaled below 1:1), alpha ≥ 110 → opaque, three tones with one tone per grid row and side, every pixel snapped to the piece's own tones (no blended edge colours), chains as alternating two-tone links, 1 px 4-neighbour ink outline (pieces under 2.5 px wide get none), blitted with smoothing off.
- Drawing order: capes, hair, tails and banners `back`; scarves `front`; `layer: 'auto'` = front when `fy < -0.3` (top-down actor facing up). HUD and windows always after all cloth.

## 6. Common mistakes (symptom → fix)

- A line or a long sheet stretched across the screen after respawn → the anchor is not a function (a stale `{x, y}` copy) or `teleport` was set huge; pass a function, keep `teleport: 0`.
- Cloth floats away from the actor while the camera scrolls → the anchor is in screen coordinates (camera subtracted) and `camera` is also passed, or the anchor is world but the draw happens outside the camera transform without `camera`; anchors are world px, pass `camera` only when you subtract it by hand.
- Every cape in the level drawn on one actor → `draw(ctx, 'back')` without a group; always pass the actor's group, and skip id-less preview sprites.
- The cape covers the face when walking toward the camera (top-down) → `layer` fixed to `front`; use `layer: 'auto'` or return `layer` from the anchor by facing.
- Cloth stops moving, or moves faster at high refresh rates, or `?t=` frames differ → `update` sits in the render loop or is skipped on some scenes; call it once per fixed step on every scene that draws cloth.
- Enemies' ribbons stay where the enemy was at the start of a new game → the anchor closure holds the old object; look the actor up by id inside the anchor function.
- Half-pixel blur on a pixel game → `snap: 'smooth'`, or smoothing left on for that canvas; use `auto` with `imageSmoothingEnabled = false`.
- A cape that looks like a stiff plate → `stiffness` 1 with a short, wide piece; lower stiffness, add segments or give it a `body` circle to drape over.
- The game still draws its old fixed cape under the new one → skip the old drawing with a condition while the cloth runs (keep the code).

## 7. Acceptance moments

- Standing in the breeze (demo `?t=1000&freeze=1`): cape stirring behind the knight, both banners flying open, streamer rippling from the beam, rope hanging.
- Still air (`?t=9100&freeze=1&wind=0&gust=0`): banners hanging limp against their poles.
- Running (`?t=2200&freeze=1`): the cape trailing well clear of the legs, the scarf tails streaming back from the neck wrap, the plume blown back.
- Off | On (`?t=3100&freeze=1&split=50`): left of the divider the baked cloth (each piece settled once in still air and carried rigidly, `rigid: true`), right the solver.
- Swing (`?t=4500&freeze=1`): the knight stopped in front of the lantern; on the hit frame the drawn blade passes through the lantern body (the hit test uses the blade's own points), the lantern swings out to about 35° (tip moves ~62 px, `checks/soak.py` asserts 30..85) and the swing whips the cape.
- Blink (`?t=5534&freeze=1&split=0`): sparkle rings at the old and new place, the cape already at the new place, nothing in between.
- Gust (`?t=6800`): every piece blown right, gust streaks; the cape streams out like a flag, showing its face and trim.
- Pixel (`&mode=pixel`): whole pixels, 1 px outline, three tones.
- Debug (`&debug=1`): points, pinned points red.
- Hosts: Cliffside Run (320×180 pixel): a 2 px headband tail trailing the hero and red/blue pennants on checkpoint posts; Briarwatch (640×360 HD top-down): the hero's cape behind (or in front when facing up), the Warden's banner, wisps' ribbons; Hollowpeak (640×360 HD side-scroller): its fixed cape, ropes and banners replaced by live ones. `?auto=1` same end as the original.
