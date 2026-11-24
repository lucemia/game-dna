# Glass & gradient UI (`glass-ui`)

A modern mobile-game look: a bright, clean daytime board under a frosted-glass HUD. Panels blur whatever is drawn behind them, glow with vivid cyan → violet → pink gradients, sit on soft layered shadows and move on springs. Code-drawn only; no bitmaps, no generated art.

## 1. Essence, and what it is not

- **Is:** glassmorphism HUD (blurred backdrop + indigo tint + sheen + gradient rim), candy-bright gradients on everything interactive, rounded everything, one crisp geometric sans, springy overshoot.
- **Is not:** `flat` (matte pastel, white opaque cards, one indigo accent, no gradients), `lit-hd` (dusk, real-time light, painted ground, serif titles), `neon-vector` (black screen, wireframe glow). No pixel grid, no outlines on the world, no texture or grain, no skeuomorphic metal or wood frames.

## 2. Material

| surface | how it is drawn |
|---|---|
| Glass panel | copy of the pixels under the panel → `blur(3 native px) saturate(2)` → clip to rounded rect → indigo tint `#33288c → #191358` at ~0.5 (0.43 top, 0.56 bottom), so what is behind survives as soft colour blobs → fine frost grain (device px, 0.07) → top sheen (white 0.20 → 0 over 22 px) → one diagonal reflection streak (white 0.055) → gradient rim hairline (white 0.75 top-left → 0.18 → team / pink tint bottom-right) |
| Shadow | three layers drawn only **outside** the panel (even-odd clip): ambient blur 12 dy 6, mid blur 4 dy 2, contact blur 1.1 dy 0.5, tinted deep indigo (rose for enemy windows) |
| Gradient fill | 2–3 stops, always lighter at the top or left, plus a white gloss band on the upper 40 % |
| World | smooth, seamless world-position gradients (no per-tile noise), glossy spheres and capsules lit from the upper left with a white specular dot |

## 3. Colour

- Accents: cyan `#22d3ee`, blue `#3b82f6`, violet `#8b5cf6`, pink `#ec4899`, amber `#fbbf24`, orange `#fb923c`, mint `#34d399`. Signature ramp: **cyan → violet → pink**.
- Glass tint: `#33288c → #191358`; ink `#14113a`; text `#f8faff`; labels `#a5b4fc`; notes `#fde68a`.
- Teams: player cyan `#38bdf8` → indigo `#4f46e5`; enemy rose `#fb7185` → `#be185d`.
- World: grass `#86e6ad → #5ccf96` by world y; water `#2fd0f0 → #1a8ce0`.
- Ranges: move cyan → blue (0.55), attack pink → orange (0.56 over a 0.26 lift), threat violet hatched (0.55), heal mint (0.6), each over a 0.22 white lift so they stay vivid on green.

## 4. Type & UI

- One family: **Outfit** on documentation pages (Google Fonts), the system UI sans stack in games. ui 7.6 / 600, title 8.8 / 700, label 5.8 / 700 uppercase +0.5 tracking, numerals 11.5 / 800. Minimum 5.5 native px (8.4 CSS px at 390 px wide).
- Body text: white with a soft 1 px indigo drop shadow plus a soft dark halo around the glyphs (`text()` draws it; `halo: false` turns it off), so it reads over any blurred blob.
- Selected row: violet → pink gradient pill with gloss and a pink glow; text stays white.
- Plates / tooltips / banners are full pills (radius = h / 2); windows radius 6; backing wells are recessed darker glass with an inner top shadow.
- Bars: recessed glass track, two-stop gradient fill, gloss band, glowing white tip dot; `ready` / `enemyFull` get a moving shine.

## 5. Motion

Matches C-10 springy-ui defaults (`motion.spring`): open 260 ms with ~12 % overshoot, close 140 ms, stagger 30 ms, glide 140 ms, lift 2 px.
- Windows open on `outBack` (`motion.ease.open`), so window-cursor pops with overshoot.
- Numbers: `pop` ease, landing squash `1.2 × 0.82` for 90 ms (smooth per-glyph `sx/sy`).
- Range tiles grow in on a damped spring (bounce 0.14); `pulsing` = a diagonal light sweep, 2.2 s period.
- Cursor ring and pointer "tap" on a spring every 1.1 s; selected pawn bobs at 0.7 Hz; path dashes flow toward the head.
- Timing (durations, order, hit-stop) never comes from the skin.

## 6. Camera & composition

Flat top-down board, no tilt. HUD floats over the board on glass with ≥4 px margins; panels should overlap colourful world content where possible (the blur needs something to blur). Daylight sheen from the top-left, a faint indigo vignette and a few slow bokeh discs in the `final` phase.

## 7. Sound (direction only)

Soft UI clicks and glassy "tinks", airy whooshes on panel open, bright bell-like chimes on crits and heals, a short rising synth sweep on level-up. No chiptune, no orchestral hits.

## 8. Signature moves (default values)

1. **Frosted panel:** blur 3 native px, saturate 2, tint 0.5 (0.94 + grain without blur). Text is protected by a soft dark halo hugging each string (`glass.halo`), not by darkening the whole panel.
2. **Layered outside-only shadow:** 12/6, 4/2, 1.1/0.5 (blur/dy, native px).
3. **Gradient rim hairline:** max(1 device px, 0.6 native).
4. **Cyan → violet → pink ribbon** for the path, cursor ring, pointer and selected row.
5. **Gradient numerals:** white → lavender (damage), yellow → orange → pink (crit), dark round edge 2.6 px, coloured glow 3.2–5 px, gloss on the upper 42 %.
6. **CRITICAL chip:** pink → orange glass pill, white rim, white label.
7. **Glass tiles:** each range cell its own rounded tile (radius 2.6, 0.8 gap) with sheen.

## 9. Common mistakes

- Filling the glass shape with its own shadow: the shadow darkens the panel. Shadows go outside only.
- Tint too heavy (≥ 0.7) with a strong blur: the panel reads as a solid card and the frosting is invisible (critic r1). Keep the tint near 0.5, the blur near 3 px, and protect text with the halo instead.
- Over a flat single-colour area the glass takes that colour's hue (teal over grass): place panels over varied content where the layout allows.
- Translucent colour washes straight on green: pink turns brown. Lift with white first.
- Blurring a panel drawn into an offscreen fade layer: there is nothing under it. The skin falls back to tint automatically; do the same in hosts.
- Mixing in a second font family, serif titles or pixel fonts.
- Gradients that go darker at the top (looks inverted / heavy).

## 10. Engine / skin API notes

- `native: {w: 256, h: 224, scale: 'fit'}`; hosts draw at device resolution with `setTransform(s)`.
- `frame()` **reads the canvas** (`ctx.canvas`) under the panel. It needs the host to draw the world before the HUD on the same canvas (the normal order). It uses the current transform (scale + translate only; rotated or mirrored transforms fall back to tint).
- `skin.glass.mode`: `'auto'` (filter if `ctx.filter` works, else downsample), `'filter'`, `'scale'`, `'off'`. `skin.glass.last` reports what the last panel used. Without blur the panel is a 0.94 tint with denser grain with the same rim, sheen and shadows, readable everywhere.
- Cost: one `drawImage` copy + blur per framed panel per frame (3 panels in the shared scene). On weak phones set `glass.mode = 'scale'` or `'off'`.
- Own `tile`, `prop`, `unitToken`, `path`, `atmosphere` (`['world', 'final']`), `frameRoles: ['row', 'backing']`, `layout: {handW: 7, handH: 6, pointerGap: 4}`.
- Numbers draw per glyph (honours `dx/dy/sx/sy/alpha/flash`); the CRITICAL label is one block and returns one rect.

## 11. Variation space

- Glass tint hue: indigo (default), teal `#0f4c5c`, plum `#4a1d5f`; tint 0.4–0.6 with blur.
- Accent ramp: cyan → violet → pink (default), mint → cyan → blue (calm), amber → pink → violet (warm).
- Light glass (white 0.35 tint, ink text) for menus over dark worlds only.
- Blur 2.5–4 native px (more erases the shapes); radius 4–10.
- World: day board (default), dusk board with stronger light pools, abstract gradient arena.

## Fits which elements

Best: window/menu elements (C-01, C-10 springy-ui, dialogue, shops), HUD gauges (A-01), damage numbers (E-01), range and path (B-01), card and run-map UI, title screens. Good with smooth HD hosts. Poor fit: pixel-art hosts (the glass breaks the pixel grid; use only as an overlay UI layer) and dark horror themes.

## Reviewer checklist

- [ ] Panels visibly blur what is behind them (filter or downsample) and still read with `?blur=off`.
- [ ] No panel is darkened by its own shadow; shadows are soft and layered.
- [ ] Cyan → violet → pink appears on the path, cursor, pointer and selected row; no other accent family.
- [ ] All text white or near-white on glass, ≥ 8 CSS px at 390 px wide, one sans family.
- [ ] Range kinds distinguishable at a glance (cyan / pink / hatched violet / mint), none brown or grey.
- [ ] Numbers are gradient-filled with a dark round edge and glow; crit is clearly the loudest.
- [ ] World is clean and bright: no grain, no outlines, no pixel snapping.
- [ ] Motion has overshoot (window open, tile grow, landing squash), never stepped.
- [ ] No horizontal overflow at 1280 / 500 / 390; `?t=&freeze=1` deterministic; no page errors.
