**Art style: Low-poly 3D (faked in 2D canvas).** Draw the game as a flat-shaded toy model seen from above, using only the 2D canvas API (no WebGL, no 3D library).

- Facets: build every object from a few triangles or quads (hexagon bases, frustum bodies, faceted crowns and gems). Fill each facet with ONE colour from a shading function: base colour × (ambient + key light × max(0, normal · sun)), normalised so flat-up faces keep their base colour. No textures, outlines or pure black.
- Ground: each 16 px tile is two triangles with a small random tilt, a lit north lip and a shaded south lip (slight isometric bevel); stone cliffs show 3–4 vertical facets; water facets glint.
- Light presets: day (pale blue sky, warm white sun), dusk (lilac ambient, peach key), night (deep blue; only lamps, fire and gems glow, with soft ground pools).
- Palette: pastel, few hues; ink #33395a, cream panels, one accent coral #ff8a5c; teams blue #5b8de0 and coral red #e8705a.
- UI: rounded sans (800–900), frosted cream panels (scene blurred behind, radius 5, soft shadow, two subtle glass facets), capsule bars split into light top and base bottom.
- Range tiles: bevelled translucent slabs with a coloured rim; path: extruded coral ribbon with a two-facet arrowhead and moving white beads.
- Damage numbers: chunky extruded digits (side colour per kind), CRITICAL in a coral capsule. Entrances use an overshoot pop (1 − e^(−6s)·cos 9s).
- Original art only; English UI.
