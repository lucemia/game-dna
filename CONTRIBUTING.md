# Contributing to Game DNA

## Report a broken element

[Open an issue](https://github.com/lucemia/game-dna/issues) with: the element id (the last part of its page URL), what kind of game you added it
to, which agent you used, and what went wrong (a screenshot or the console error helps). Problems in the prompt or the
module are the most useful reports: most failures we found were in our own docs.

## Propose a new element

Open an issue describing the effect or system, what the player sees, and one or two kinds of game it belongs in.
Please don't name or copy existing games, characters or art; describe the mechanic instead.

## Repository layout

- `elements/<id>/`: `module/` (the JavaScript file an agent includes), `prompt.md`, `demo/`, and for systems `starter/`.
- `combos/`: ready-made combinations. `skins/`, `pixel-kit/`, `demo-kit/`: shared art used by the demos.
- `site/preview/`: the built site. `tools/`: the build and combine scripts (details in `tools/README.md`).

## Combine elements from the command line

The Basket page on the site does this in the browser. From the repo root:

```sh
node tools/combine.mjs damage-pop bloom-glow squash-stretch --out my-combo     # one COMBO.md + the modules
node tools/combine.mjs card-battle damage-pop --starter --out my-card-game      # start from a system's starter game
node tools/combine.mjs damage-pop bloom-glow --check                            # compatibility only
```

## Build the site

```sh
node tools/build-site.mjs --preview      # regenerates site/preview/ from elements/ and site/assets/
python3 -m http.server 8000              # from the repo root, then open http://localhost:8000/site/preview/
```

Node 18+ and Python 3, no installs. `tools/showcase-deploy/` builds a static upload folder for any static host.
