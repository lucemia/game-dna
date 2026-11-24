# Prompt templates: cutout characters (L-10)

Fill every `<...>`. Every prompt ends with the STYLE LOCK paragraph (`style-lock.txt`), which carries the guard sentence
"Original, no resemblance to any existing game, film or franchise character, no text, no logo, no watermark."; run
`python3 tools/namecheck.py --require-guard <prompt file>` before sending. No names of real games, franchises,
characters, studios or living artists, no "in the style of <Name>": describe the look in words (the STYLE LOCK does).
Pick designs that are not a genre cliche: change at least two of colour, outfit, silhouette and prop.

Generate with the built-in image tool (image_gen), one image per call, `transparent_background: true`. Never draw or
retouch an image with code: scripts only cut, clean alpha, scale and pack.

## 1. Full body (one per character)

**Derive the cast from the host game, not from this file's examples.** Read the game's title, setting, palette and
its own characters (names, roles, colours, enemies), and design for that world: a desert caravan game gets sun-bleached
linen and bronze, a snowy ridge gets furs and iron, a sea game gets oilskin and rope. Across the cast vary class
(sword, spear, mage, archer, brawler...), age, build, skin, hair colour AND style (never default to long white or
blonde hair), and give each character a different main palette; no two characters share a cape colour. Name the
game's own colours in the description.

**The line must show.** Every prompt asks for the thin dark warm-brown outline (it is in the STYLE LOCK); if the
image comes back soft-edged without a visible outline, regenerate it rather than continue.

The FIRST character: no `referenced_image_paths`. Every later character: pass the first character's PNG (absolute
path) so the rendering matches.

```
<For later characters: Match the attached reference character exactly in rendering: same line weight and colour, same
soft 2-3 step shading, light direction, proportions and scale on the canvas. Do not copy the person, costume or weapon:
draw only the new character described here.>
One full-body character on a tall canvas, head to boots, nothing cropped, a small transparent margin: an original
<role: swordsman | spear fighter | mage | archer ...>, <age, build, skin, hair>, <cape or cloak>, <armour piece>,
<under-tunic>, <belt detail>, <tall boots>; <weapon, shape and material> in the <near | far> hand, <shield or free hand>.
Three-quarter view turned toward the viewer's right, low ready combat stance, looking right. A soft dark contact
shadow ellipse under the feet.

<STYLE LOCK paragraph>
```

## 2. Parts sheet (one per character; reference = that character's full body ONLY)

```
2D cutout-animation parts sheet (a rigging kit for skeletal 2D animation) of the character in the attached reference
image: the SAME character with the same costume, colours, thin dark warm-brown line art and soft hand-painted shading,
taken apart into separate pieces. Each piece is complete and fully painted on its own, like a separate paper cut-out,
and is separated from every other piece by clear transparent space: no piece touches or overlaps another. All pieces
at the same scale as each other, arranged in neat rows on a wide landscape canvas, in this order, left to right, top
row first:
Row 1: (1) the head with hair and neck, three-quarter view looking right; (2) the torso from the base of the neck to
the waist, <its armour / top>, without arms and without head; (3) the hips: <belt, sash or tunic skirt> down to
mid-thigh, without legs; (4) <the cape on its own, seen from behind the shoulders, hanging straight down | the long
coat skirt on its own, from the waist down, hanging straight down>.
Row 2: (5) the near upper arm <sleeve / pauldron>; (6) the near forearm with <glove / cuff> and <a closed fist | an
open hand>; (7) the far upper arm; (8) the far forearm with a closed fist; (9) the <weapon> alone, <horizontal, tip
pointing right | vertical, head at the top>; <(10) the <shield> alone, seen at a slight angle.>
Row 3: the near thigh; the near lower leg with the <boot>, toe pointing right; the far thigh; the far lower leg with
its boot, toe pointing right.
Every limb piece is perfectly straight (no bend at the elbow or knee), drawn vertically, hanging straight down, in the
same three-quarter view as the reference. Every piece has rounded, slightly extended ends at its joints: the
shoulder, elbow, hip and knee ends continue a little past the joint as a smooth rounded cap of the same cloth,
leather or skin, so that it overlaps its neighbouring piece when rotated; no flat cut edge, no gap, no hole. The
torso extends rounded flaps at the shoulders and at the waist, and the neck continues down below the collar. Hands
are empty, closed fists (no weapon in any hand); the weapon is drawn only once, on its own. Nothing is missing and
nothing is duplicated.
Same warm key light from the upper LEFT on every piece, cool soft shade on the right side, a thin bright rim on metal
edges, soft hand-painted gradients with 2 to 3 value steps. Fully transparent background (real alpha), no shadows on
the ground, no backdrop, no frame, no labels, no numbers, no guide lines, no colour swatches.
Original, no resemblance to any existing game, film or franchise character, no text, no logo, no watermark.
```

Regenerate a sheet when two pieces touch, a limb is bent, a piece is missing or a weapon is in a hand (`--list`
shows the piece count).

## 3. Cut and rig (`tools/make-pack.py`)

1. `python tools/make-pack.py --list art/gen/<run>/<id>-parts.png` prints the pieces, numbered top row first.
2. Write `art/rig-config.json` (copy the shipped `rig-config.json` as a start): per character `id`, `role` (motion set:
   `sword`, `spear` or `mage`), `sheet`, `order` (piece number -> part name), `z` (back to front), `weaponHand`
   (`N` near, `F` far), and per part `pivot` + `joints` as FRACTIONS of the piece's box ([0.5, 0.1] = centre, near
   the top). Starting values that fit most sheets:

| part | pivot | joints |
|---|---|---|
| head | the centre of the neck where it meets the collar line, ON the neck (measure it on the overlay: a braid or long hair makes the box taller than the neck, so 0.9 can fall below it; typical y 0.7-0.9) | top [0.5, 0], neck (the same point again), chin (lowest point of the jaw); `collar` when the head piece carries its own collar |
| torso | waist [0.5, 0.94] | head [0.5, 0.14] (the neck opening at the COLLAR LINE, not the top of the painted neck stub: the chin should end up 0.1-0.45 head heights above it), armN [0.2, 0.3] (the shoulder on the LEFT of the image), armF [0.85, 0.28], cape [0.5, 0.1] |
| pelvis | hip centre [0.5, 0.35] | torso [0.5, 0.08], thighN [0.33, 0.55], thighF [0.66, 0.55], skirt [0.5, 0.12] |
| armN / armF | shoulder [0.5, 0.15] | fore (elbow) [x of the sleeve's centre line, just above the sleeve hem]; cut the stub below the hem with `"erase": [[[-0.1, y], [1.1, y], [1.1, 1.1], [-0.1, 1.1]]]` (y = just below the hem line) and list it in `"pegs"` |
| foreN / foreF | elbow [x of the top cap's centre, 0.10-0.14] (inside the top cap, not at its edge) | hand (fist centre) [0.5, 0.86] |
| thighN / thighF | hip [0.5, 0.12] | shin [0.5, 0.86] |
| shinN / shinF | knee [0.45, 0.08] | ankle [0.4, 0.86] (the boot foot is cut off here so it stays flat) |
| weapon | the grip | grip (same point), tip (the striking end) |
| shield | its grip [0.36, 0.5] (a little behind the centre, so the forearm shows) | top [0.5, 0] |
| cape / skirt | top centre [0.5, 0.05] | hem [0.5, 1] |

   Typical z (back to front): cape or skirt, far forearm, far upper arm, shield, far leg (shin, thigh), near leg,
   pelvis, torso, head, (collar,) weapon, near forearm, near upper arm. Neck: when the head's neck would lie on a cloak or collar, give the torso `"over": {"collar": [[fx, fy], ...]}` (the cloth in front of the neck), put `collar` right after `head` in z, and list the painted neck stub above the collar in the torso's `"pegs"` (cut it with `"erase"` if it peeks out beside the neck). `checks/run-checks.py` `neck` fails a head that is off its neck, a neck longer than 0.45 head heights, a visible stub or a seam. Put the upper arm ABOVE its forearm (the stub is cut away, so the forearm comes out of the sleeve), the shield right after the far arm (behind the legs and body) and the weapon just under its hand.
3. `python tools/make-pack.py art/rig-config.json --out art/cutout --overlay art/check` writes `chars/<id>.webp`,
   `pack.json`, `pack.js` and an overlay (red = pivots, cyan = joints) to check every point sits on its joint.
4. Elbows and knees open the widest gaps, and the FAR arm (behind the torso, bent most in attacks) shows them first: render the attack and hurt poses at 400 px or more and look at both elbows, the far one especially. If light shows between upper arm and forearm, move `fore` up (0.84 -> 0.80) and the forearm pivot down (0.12 -> 0.15) to add overlap.
5. Look at the rest and attack poses in the game at large size; move a fraction by 0.02-0.05 where a joint shows a
   gap or a doubled edge, and rebuild.
