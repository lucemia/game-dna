# Style prompt: Flat vector / minimal geometric

Art style: modern mobile-strategy flat vector. Render smoothly at device resolution (canvas backing store = CSS size × devicePixelRatio; no pixel snapping, no dithering). Build everything from geometric shapes: rounded-rect tiles with a 1 px gap and two-tone faces (a darker side copy offset 1 px under a lighter top) for elevation; water sits lower as one continuous channel; round two-tone unit tokens with a white face and a simple emblem.

Palette: light cool-grey ground (#e4e8f1), pastel terrain, ink #29304d (never black) and ONE strong accent, indigo #5b4bff→#7d6bff, used only for what the player can act on: selection ring, path arrow, menu pointer, phase banner, critical hits. Teams are pastel blue #6f8cff and coral #ff8574.

UI: white rounded-rect cards (radius ~20 CSS px) with a soft wide shadow and at most a 1 px hairline; pills for plates, bars and tags; a geometric sans (system-ui stack, Inter where available) with bold headings and small uppercase tracked labels. No outlines anywhere else.

Range overlay: translucent pastel regions (lift the ground toward white first, then tint) with rounded outer corners, a thin boundary line and faint white seams. Path: a smooth bezier arrow with rounded corners, white casing, accent gradient core and a rounded triangular head. Damage numbers: bold sans numerals on soft pills that bounce and fade as one piece (crit = accent pill + "CRITICAL" tag). Motion is eased (cubic, back-out), never stepped.
