**Art style: Lit HD 2D.** Smooth, hand-painted-looking HD 2D at dusk, lit by real-time light. No pixel grid anywhere.

- Canvas: render at device resolution (display px × devicePixelRatio), anti-aliased shapes only.
- World: paint the ground as one continuous field (world-position colour noise, bilinear, no tile seams), plus soft brush dabs and grass tufts.
- Figures and props: soft gradient shading lit from the upper left, a rim of the nearest light's colour on the side facing it, a soft contact shadow.
- Light (include these modules unchanged for the full look): `webgl-post` (WebGL post-process pipeline), `dynamic-lights` (Dynamic 2D lights & soft shadows: ambient ~0.34, cool blue-teal tint, 2–4 small warm/cool point lights with soft shadows from unit and prop footprints), `bloom-glow` (Bloom & glow: draw only flames, lamp glass, crystals, orbs, glowing eyes, the move arrow and cursor into its emissive layer), optionally `color-grade-lut` (Colour grading LUT `dusk`, ~0.3). Give all of them one shared `uiMask` covering windows and numeral glyph shapes, so UI stays crisp, unlit and ungraded. With WebGL off, draw a 2D dusk wash, light pools and a vignette.
- UI: soft rounded dark dusk-glass panels (radius ~5) with a warm inner glow, a bright top bevel line and a team-coloured light leak at the top-left; Marcellus for titles, Figtree for items. Amber accent `#ffc46b`.
- Numbers: heavy rounded sans, dark soft outline with drop shadow, top-lit gradient, coloured glow on crits.
- Ranges: translucent washes with glowing rims; the path is a glowing light ribbon.
- Original art only; English UI.
