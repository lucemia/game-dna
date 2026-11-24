**Art style: Glass & gradient UI.** A modern mobile-game look: a bright, clean daytime board under a frosted-glass HUD.

- Panels: copy the pixels already drawn under each window, blur them (~3 native px, `saturate(2)`, so shapes survive as soft blobs; use `ctx.filter` when it works, otherwise a downsample/upsample blur), clip to a rounded rect (radius ~6, pills for plates), then add an indigo tint `#33288c → #191358` at ~0.5, fine grain, a white top sheen and a gradient rim hairline. Protect text with a soft dark halo per string. Without blur: tint ~0.94.
- Shadows: three soft layers (blur 12/4/1 px, dy 6/2/0.5) drawn only outside the panel.
- Accents: vivid gradients cyan `#22d3ee` → violet `#8b5cf6` → pink `#ec4899` on the selected-row pill, pointer, cursor ring and path ribbon. Bars: recessed glass track, gradient fill, gloss band, glowing tip.
- Type: one crisp geometric sans (system UI stack), white with a soft drop shadow; tracked uppercase labels `#a5b4fc`.
- Numbers: bold numerals with a top-to-bottom gradient fill, a dark rounded edge and a coloured glow; crits yellow → orange → pink with a gradient "CRITICAL" chip.
- World: seamless gradient grass, turquoise water with gloss lines, glossy rounded props and capsule pawns; range cells as separate rounded translucent tiles over a white lift.
- Motion: springy (open ~260 ms with ~12 % overshoot, close ~140 ms, landing squash), never stepped.
- Original art only; English UI.
