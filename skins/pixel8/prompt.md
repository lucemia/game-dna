Art style: **8-bit console pixel**.

Draw the whole game at 256×240 native resolution on one canvas and scale it up by a whole number only, with `image-rendering: pixelated`. Build the world from 16×16 tiles made of 8×8 cells.

Use one fixed palette of about 25 colours and never mix new ones: black `#000000`, white `#fcfcfc`, greys `#bcbcbc` `#7c7c7c`, blues `#a4e4fc` `#3cbcfc` `#0078f8` `#0000bc` `#6888fc`, reds and oranges `#f83800` `#a81000` `#f87858` `#fca044` `#e45c10` `#881400`, yellows `#f8d878` `#f8b800`, greens `#b8f818` `#58d854` `#00a800` `#005800` `#58f898`, purples `#d8b8f8` `#6844fc`, earth `#ac7c00` `#503000`, skin `#fcd8a8`. Each sprite or UI element uses at most 3 colours plus transparent, with a black outline.

No alpha blending, gradients, glow or blur anywhere. Where you would fade or tint, use a screen-aligned checker dither (full, 3/4, 1/2, 1/4). Range overlays are a checker of one colour with a 1 px boundary (white for movement, red for attack).

Text is an 8×8 bitmap font in capitals, one colour per glyph, optional 1 px black drop shadow. Pop-up numbers use the same blocky digits in a flat colour with a 1 px black outline; critical hits are the same digits at 2×. Windows are a black, white, black 1 px border around one flat fill (deep blue `#0000bc`); the menu pointer is a solid white triangle.

Animate at a 15 fps feel: stepped frames, whole-pixel positions, palette cycling instead of pulsing alpha, no flicker.
