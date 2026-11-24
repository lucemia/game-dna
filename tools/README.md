# tools/

## combine.mjs: combo basket

Merges several elements into ONE English prompt plus their module files, for an agent adding all of them to a game we have never seen.

```sh
node tools/combine.mjs <id> <id> ... [--out dir] [--param key=value | id.key=value ...] [--check] [--force] [--starter | --no-starter]
node tools/combine.mjs active-time-battle damage-numbers --out combos/atb+damage            # generic, for an unknown game
node tools/combine.mjs active-time-battle damage-numbers --starter --out combos/starter-atb+damage   # ship the starter
node tools/combine.mjs grid-range-path damage-numbers --param range=1-2 --param damage-numbers.scheme=warm
```

- `--out`: output folder (default `combos/<id>+<id>...`).
- `--param`: a bare key applies to every element in the combo that has it; `id.key=` targets one. Values are validated against `element.json` `params` (options, min/max, step).
- `--check`: compatibility check only. `--force`: write even when the check reports errors.
- **`requires`** in element.json (e.g. J-01 dynamic-lights requires `webgl-post`): each required element missing from the list is added before the element that needs it (a NOTE says so), so its module, README and wiring section ship in the combo.
- `--starter` / `--no-starter` (default `--no-starter`): whether a system element ships its starter game (see below).
- Exit codes: 0 ok, 1 usage, 2 errors (nothing written), 3 written but the shared part of COMBO.md is over 900 words.

**Kinds (FORMAT v1.2-v1.4):** each element is an `addon` or a `system` (`element.json` `kind`; missing = addon). A basket holds 0-1 system plus any number of addons; two systems are rejected, even with `--force`. Since v1.4, a system element also goes into an unknown game without its starter; that is the default.

- **Starter basket** (`--starter`, one system): the out dir (default `combos/starter-<ids>`) gets the system's starter as `index.html`, its README as `index.README.md`, and the addon modules and READMEs. COMBO.md says "add these addons to this starter". It names the starter's documented extension points, which we ship: register each addon via the addon hook list, turn off the starter's built-in equivalent, keep autoplay / URL params / shortcuts working, plus per-addon wiring. Built from the system hint's `starter` section and each addon hint's `addon` section (below).
- **Generic basket** (default; addons only, or a system without its starter): the unknown-game COMBO.md described next. Shared premise 2 (keep the game's integer scaling) is replaced by "scaling is set by the pixel scaler" when `pixel-scaler` is in the basket.
- **`"scope": "starter-only"`** (v1.3, e.g. fog-of-war) in element.json: the addon is accepted only with `--starter` and a system element; otherwise the check reports an ERROR.

**Output of a generic basket** (in the out dir): `COMBO.md` (the merged prompt), each module's `.js` copied byte for byte, and each module README as `<id>.README.md`. The user hands all of these to their own agent.

**COMBO.md layout:**
1. shared premises (verbatim modules, keep native resolution and integer scale, one fixed 60 Hz step, screen-pixel coordinates, original art and names, hook don't replace);
2. order of work (read the game and note where its roles live; foundations → systems → UI → effects; check the game runs after each element);
3. prerequisites the game must have;
4. one section per element: what it does, chosen parameters, integration points by role, common mistakes;
5. cross-element wiring;
6. merged acceptance checks;
7. a self-check without a browser, with the modules' sha256.

It never names a host's functions.

**Compatibility check** (from `element.json` `interfaces` and `family`):

| Rule | Level |
|---|---|
| Same `family` (both own one system) | ERROR |
| `time`: a `turn` element with a `tick`/`realtime` element, neither on an fx/post layer (both decide when units act) | ERROR |
| `coords` differ and neither is fx/post | ERROR |
| `coords` differ, one is fx/post (needs only screen anchors) | NOTE |
| `time: "any"` on either element (modal UI, FORMAT v1.5) | OK (runs inside the other's step) |
| `coords: "screen"` on either element (needs only screen rects) | OK |
| Two elements on the same non-fx `layer` (e.g. both `ui`) | WARN |
| A `needs` entry that no other element in the combo `provides` (matched through a small capability vocabulary in the script; `text-box` = anything naming H-01, the dialogue box) | WARN (game must provide it; listed in COMBO.md "Prerequisites") |
| An optional need left to the game | NOTE |
| No `tools/basket/<id>.mjs` for an element | WARN (generic section) |
| Two or more `system` elements | ERROR (not forceable) |
| `--starter` without a system element, or a system with no starter file | ERROR |
| A `starter-only` element without `--starter` | ERROR |
| Starter basket: needs | OK (met by the starter / its extension points) |

The first line of the check output lists each element's kind.

## basket/<id>.mjs: per-element wiring hints

One ES module per element, default export:

- `stage`: `foundations` / `systems` / `ui` / `effects`. Sets the order of work; the default comes from `interfaces.layer`.
- `does`: a short paragraph.
- `params`: `{key: how it is used | 'IGNORE'}`. IGNORE hides the parameter, e.g. `res`, because the game keeps its own resolution.
- `steps`: `[[where (a role, never a host function name), what to call]]`. `{{key}}` is replaced by the chosen value.
- `gotchas`: symptom -> fix, rewritten from element.md "Common mistakes" without host names.
- `checks`, `selfcheck`.
- `lead` (optional): one sentence that says WHERE the element goes in the game, built from a designer's text parameter (e.g. `Put the skill check exactly at: {{moment}}. Do not add it anywhere else.`). An addon-only COMBO.md shows it first, under "Where it goes in my game", and again in bold at the top of the element's section. Text parameters (`"type": "text"` in element.json) take any non-empty string: `--param timing-bar.moment="opening the chest (lockpick)"`; they are left out of "Parameters chosen".
- `offers` / `wants`: cross-element wiring by tag. An offer is a string or `{title, text}`; only its `text` goes into COMBO.md. Tags: `hit-site`, `freeze`, `ui-rects`, `anchor`, `battle-start`. When element A wants a tag that element B offers, COMBO.md gets B's offer text followed by A's want text, and A's `check` goes into the merged acceptance checks.

Starter baskets also use:
- in a system hint, `starter`: `{name, register, hit, draw, rects, field, anchor, clock, reset, builtins: {numbers: ...}, keep, traceFrom, autoCheck, freezeLimit?}`, the starter's extension points in prose;
- in an addon hint, `addon`: `{builtin, steps, gotchas, checks, selfcheck, with: {<systemId>: {params, ...notes}}}`. Its steps use `{{sys.key}}` (the system's starter text), `{{with.key}}` (this addon's notes for that starter) and `{{param}}`. `with.<id>.params` overrides a default unless it was set with `--param`.

A new element needs a hint file. Without one, combine still runs, but that element's section only points to its README.

Review notes on the two first combos, and module APIs too tied to our hosts: `combos/NOTES.md`.

## build-site.mjs and site-frames.py: the local website

`node tools/build-site.mjs` builds `site/` (static HTML/CSS/JS, relative links) from `elements/`, `skins/` and `tools/basket/`.
`--verify` also runs the browser basket (`site/assets/combine-core.js`, a port of `combine.mjs`) against `node tools/combine.mjs`
on sample baskets and every single element, and fails unless COMBO.md and the file list are byte-identical.

```sh
node tools/build-site.mjs --verify
python3 -m http.server 8000        # from the repo root, then open http://localhost:8000/site/
uv run --with playwright python -I tools/site-frames.py            # element hover loops (12 frames each) -> site/assets/frames/
uv run --with playwright python -I tools/site-frames.py --styles   # style images (shared scene, canvas only) -> site/assets/styles/
uv run --with playwright --with pillow python -I tools/site-frames.py --moments    # A-D moments for element pages -> site/assets/moments/
```

- **HD demos** (M9, listed in `HD` in site-frames.py) are recorded as composited page screenshots clipped to the stage, so WebGL post effects show; their card loops scale smoothly (`data-hd`) instead of in whole pixels. Light-stack styles (`lit-hd`) take their images from the skin's own preview with WebGL on.
- **A-D moments:** up to four acceptance moments from element.md §7 that name ONE demo time (`?t=<ms>`, not a range); other query keys on that line are kept. Each is captured at `?t=<ms>&freeze=1`, captioned with its state and time, and clicking it loads the demo at that moment. Moments the spec gives without one exact time (a query only, a range, a review-shot name with `t<ms>`) are in `MANUAL` in site-frames.py with a time taken from the shot name, the element's shoot list or its main demo time, each checked against the frame; every moment has a time, a caption and a link.
- **`requires`:** shown on element pages (chip, Compatibility, the prompt names both modules); the basket's **Add** puts the required element in first, and `combine-core.js` adds it like `combine.mjs` does.
- **Generated art (`assetPack`, L family):** element pages show ✦ and say that your own set needs image generation (Codex image_gen) while the sample pack works without it; **Sample art pack (.zip)** zips `assets.json`, the images and `prompt-pack.md`. The basket zip is COMBO.md + modules exactly as `combine.mjs` writes them, plus (ticked by default) each pack under `art/<id>/` and an `art/README.md` that says to load each pack with `base: 'art/<id>/'`; combine.mjs itself never ships images.
- **Family colours** (12, A-L): one categorical palette per theme, picked and checked with the dataviz validator; the method and results are in the comment above `FAMILY_COLOURS`.
- **New badges and changelog:** `RELEASE` (M8, M9, M10 element ids), `STYLE_RELEASE` / `STYLE_GEN` (style cards: New, ✦ AI art) and `CHANGELOG` in build-site.mjs; "New" marks only the latest release, earlier ones are in the /dna/ "Added" filter.
- **Basket files (M11):** `element.json` `basketFiles` `[{from, to}]` (N family: `vendor/three@0.149.0/three.min.js` as `three.min.js`; N-02 also `demo-kit/` kit-art.js, kit.js and the L-10 module + pack.js) are copied by `combine.mjs` after the modules and listed by `combine-core.js`; a name the starter already ships is not copied twice.
- **3D captures (M11):** `GL3D` pages launch Chromium with SwiftShader (`GL_ARGS`), are sized 1280x720 and captured once `window.__frozen` is true; `PAGE` shows N-01 / N-03 from their starter games (moments link there too).
- **Starter files:** `element.json` `starterFiles` (A-14: `["art"]`) is expanded at build time into a file list in `basket-data.js`, so the browser basket's zip ships the same files beside the starter as `combine.mjs`; `--verify` compares the out folder recursively.
- **Cold-test rows (M10):** `coldtests/sol/judge-m8|m9|m10-<id>[-pack|-regen][-rN].json`; `-pack` / `-regen` label the asset layer, and the judges' different `judgedAt` formats are normalised before the rows are ordered. `COLD_RERUN` names the module version a rerun tested (instead of "rerun rN after a fix"), and `COLD_PENDING` adds a note under the table while a cold test is still running. Moments: specs whose acceptance heading is unnumbered (`## Acceptance moments`) are read too, lines that start with `Starter` or `Host` are not demo moments, and `MOMENT_CLIP` picks another canvas for one moment (L-07 D: the hand).
- **Sentence + lede:** `PITCH` (one plain benefit per element) builds "Add <element> to <your game>: <pitch>." at the top of each element page; the lede is the one-liner's first sentence when short.
- **Demo frames** grow to their content up to 2600 px on phones (4000 px on wide screens); longer demos scroll inside the frame and the page says so.
- **Smooth styles** also have 1024-wide `<slug>-a2x.webp` / `-b2x.webp` images (served with `srcset`); pixel styles stay 512 and integer-scaled.

Hand-written site code is in `site/assets/` (site.css, site.js, combine-core.js, zip.js, basket.js, element.js, index.js, home.js,
style.js; combine-core.js is a port of combine.mjs, including `requires`, the generated-art stacking rule and the smoothing premise); everything else in `site/` is generated. Cold-test results shown on element pages are in `STATUS` in build-site.mjs.
