# Prompt fragment: neon-vector (Neon vector arcade)

Art style: neon vector arcade, original look. Smooth canvas rendering (not pixel art) on a pure black background. Everything is a thin glowing line, like a vector-display cabinet: stroke each path three times wide and translucent (additive), then the colour line (about 0.7 native px), then a white-hot core. No shadowBlur. Terrain, units, props, windows and arrows are wireframe outlines; fill closed shapes black first so they hide the lines behind them. No solid colour areas: at most a faint additive tint.

Palette: four neon hues plus white, each with one meaning: cyan #29f3ff (player, move range, text), magenta #ff2fd8 (enemy, attack), yellow #ffe93b (cursor, path, crits, titles), green #3dff86 (heal, HP, plants). A faint cyan wire grid marks the floor.

UI: black panels with chamfered corners and one glowing edge in the team colour, a dim inner rule and faint scanlines. Text is a custom uppercase stroke font of straight chamfered segments with a black underlay. Bars are LED segment meters; the menu pointer is a small vector ship.

Numbers: seven-segment digits with visible gaps between segments; critical hits are yellow with a magenta echo, radiating line sparks and a CRITICAL label between dashes. Range cells show an inset wire square and a glowing boundary (threat dashed yellow). The move path is a hollow glowing tube with a hollow arrowhead and a travelling spark.

Motion leaves short phosphor afterimages (two ghosts, 45 ms apart). Optional CRT post: subtle scanlines and vignette, no curvature. Skin id: `neon-vector`.
