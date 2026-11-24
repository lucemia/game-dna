Art style: **4-shade handheld pixel**.

Draw the game on one canvas at a small native resolution (160×144 for a true handheld feel) and scale it up by a whole number only, with `image-rendering: pixelated`. Build everything from 8×8 tiles.

Use exactly four shades of one ramp and nothing else: `#dfe9b4` (lightest), `#9db36c`, `#4c6844`, `#1a2a20` (darkest). Variants: warm sepia `#f3e3c2 #c69c6a #77502f #2a1810` or cool grey `#e6e9ee #a4aab6 #575d6b #1c1e26`. Every sprite has a 1 px outline in the darkest shade. Where you would want a fifth colour or transparency, use dither (checker, stripes, dots).

With no hue, tell things apart by pattern and inversion: movement range = checker with a solid double edge, attack range = dark diagonal stripes with a dashed edge, enemy threat = sparse opposite stripes with a dotted edge. The move path is a light road with a dark outline and marching dashes. Player sprites are light, enemies dark.

Text is a chunky 8×8 bitmap font in capitals, one shade per glyph. Pop-up numbers are light digits with a 1 px dark outline and drop; heals and the CRITICAL label are inverted. Windows: light body inside a dark / light / dark double line; selected row is a mid-light band; the pointer is a solid dark arrowhead; turn plates are inverted.

Effects: flashes are palette inversions, fades step shades toward the lightest and then flicker, transparency is sprite flicker. Optional: LCD ghosting and a faint pixel grid as post effects. No alpha, gradients, glow or blur.
