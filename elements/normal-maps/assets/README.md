# L-05 sample pack: albedo + packed normal / material maps

`assets.json` (format `gamedna-assets/1`) lists 9 painted bitmaps and, for each, one derived map. Everything here is
built by `elements/normal-maps/tools/make-pack.py`; the maps by `tools/assets/normalmap.py` (Python 3 + Pillow,
`uv run --with pillow python tools/assets/normalmap.py --help`). Check with
`uv run --with pillow python tools/assets/assetcheck.py elements/normal-maps/assets/assets.json` (re-derives every map).

## Files

| key | albedo (`albedo/`) | map (`maps/`) | from |
|---|---|---|---|
| herbalist | herbalist.webp 134x240 | herbalist.nh.webp 268x240 | L-00 `with` run |
| keeper | keeper.webp 136x240 | keeper.nh.webp 272x240 | L-00 style sheet |
| lamppost | lamppost.webp 122x300 | lamppost.nh.webp 244x300 | L-00 style sheet |
| well | well.webp 183x260 | well.nh.webp 366x260 | L-00 `with` run |
| vial | vial.webp 80x128 | vial.nh.webp 160x128 | L-00 style sheet |
| key | key.webp 106x128 | key.nh.webp 212x128 | L-00 `with` run |
| maren | maren.webp 366x336 | maren.nh.webp 732x336 | L-02 portrait (neutral) |
| slot | slot.webp 127x128 | slot.nh.webp 254x128 | L-06 item slot |
| lamppost-off | lamppost-off.webp 117x300 | lamppost-off.nh.webp 234x300 | `gen/lamppost-off`: one Codex edit (a fixed model / high, the L-00 lamppost as reference): the same post, lantern unlit. `state: {of: 'lamppost', lit: false}` (the lit one has `lit: true`); draw at the same height |

The albedo files are byte-identical copies of the shipped files of those packs (same sha256; `from` names the original,
`source` / `prompt` point at the original Codex run record, so provenance is checked there). No new image was generated
for this pack, except `lamppost-off`.

## Manifest entries

- Albedo entry: the usual fields (`key`, `role` sprite / prop, `file`, `w`, `h`, `sha256`, `anchor`, `drawH`, ...) plus
  `normal: "<key>-nh"`, the key of its map.
- Map entry: `role: "normalmap"`, `key: "<key>-nh"`, `file`, `derivedFrom: "<key>"`, `layout: "nh2"`, `w` = 2 x albedo w,
  `h` = albedo h, `sha256`, `bytes`, `albedoSha256` (the albedo the map was derived from), `params` (the derive settings,
  so anyone can re-derive), `domeR` (the rounding radius actually used, px).

## The `nh2` layout (one opaque RGB file, twice as wide as the albedo, pixel-aligned with it)

| half | x range | R | G | B |
|---|---|---|---|---|
| left: normal | `[0, w)` | nx * 0.5 + 0.5 (+x right) | ny * 0.5 + 0.5 (**+y up** on screen) | nz * 0.5 + 0.5 (+z toward the viewer, >= 0.5) |
| right: material | `[w, 2w)` | height 0..1 (1 = highest point of the subject) | ambient occlusion (1 = open) | gloss / specular mask |

- Albedo pixel `(x, y)` -> normal at `(x, y)`, material at `(x + w, y)`. UV: `u_normal = u * 0.5`, `u_material = 0.5 + u * 0.5`.
- Transparent albedo pixels hold the flat normal `(128, 128, 255)` and material `(0, 255, 0)`. Mask with the albedo's alpha.
- The file is opaque on purpose (browsers premultiply alpha on decode, which would wipe channels stored next to alpha 0).
  Lossless WebP: decode is exact. In WebGL use `NEAREST`, or `LINEAR` with UVs clamped half a texel inside each half.
- Image rows grow down, the stored normal is y up: in a y-down screen space use `ny_screen = -(G * 2 - 1)`.
- Decode: `n = rgb * 2 - 1` then normalise (8-bit rounding leaves |n| within ~0.4 % of 1).

## Lighting it (what L-05's module and J-02 do)

`diffuse = max(0, dot(n, L))`, light vector `L` from the pixel to the light with z = the light's height above the
sprite plane (normalised). Typical: `colour = albedo * (ambient * ao + diffuse * lightColour * attenuation) + gloss *
pow(max(0, dot(n, H)), 24) * lightColour`, `H = normalize(L + (0, 0, 1))`. A rim term `pow(1 - nz, 2)` x back light
reads well on painted art. `GameDNA_NormalMaps` (`module/normal-maps.js`) does this on the CPU for 2D canvases; J-02
does it in WebGL.
