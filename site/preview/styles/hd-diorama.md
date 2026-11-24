**Art style: HD pixel diorama.** Render the game as a lit miniature with pixel characters standing in it like paper cards.

- Canvas: native 256×224; backing store = native × an integer (3–5) with `setTransform`. Sprites, numbers and text sit on integer native pixels with smoothing off, so every art pixel is a sharp square; light, glass, glow and blur are smooth.
- Light: one cool ambient (≈ 0.27, 0.31, 0.52) against 2–4 warm or saturated point lights (lantern, fire, spell, crystal), each with a visible pool on the floor (falloff (1 − d²/r²)²). Fire flickers about ±20 %.
- Shadows: every unit and prop casts its silhouette away from the up-to-3 nearest lights (alpha ≤ 0.72), plus a dark contact shadow. Card brightening from lights is capped at 0.3; never burn sprites to white.
- Depth: tilt-shift: sharp focus band through the action rows, far and near rows blurred about 1.8 px; dust motes with bokeh; bloom on emissive things; vignette 0.6. Never blur sprites, numbers or UI.
- UI: dark frosted glass panels (scene blurred behind), 0.5 px dark-gold and 0.35 px gold hairlines, small corner diamonds, 5×7 pixel capitals in parchment white with a 1 px drop.
- Range tiles: translucent wash with a glowing edge on the set boundary; path: gold ribbon with a bright core, arrowhead and travelling sparks.
- Damage numbers: 6×9 pixel digits, 1 px ink outline, top-light gradient, soft coloured glow; crits at 2×.
- Original art only; English UI.
