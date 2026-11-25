# Contributing to Game DNA

## Report a broken element

[Open an issue](https://github.com/lucemia/game-dna/issues) with: the element id (the last part of its page URL), what kind of game you added it
to, which agent you used, and what went wrong (a screenshot or the console error helps). Problems in the prompt or the
module are the most useful reports: most failures we found were in our own docs.

## Propose or add an element

1. **Request it.** Open a [Request an element](https://github.com/lucemia/game-dna/issues/new?template=request-an-element.yml) issue: the effect
   or system, what the player sees, and the kind of game it belongs in. Genre words are enough; please don't name or
   copy existing games, characters or art.
2. **Discuss.** We agree in the issue on what the element does, whether it is an add-on (plugs into any game) or a
   system (comes with a starter game), and what it must not break.
3. **Open a pull request.** The [pull request template](.github/PULL_REQUEST_TEMPLATE.md) has the checklist: a playable
   demo, a dependency-free JavaScript module, a `prompt.md` (600 words or fewer) that tells an agent how to wire it in,
   a self-check the agent can run, and original art (AI-generated art marked and listed in `PROVENANCE.md`).
4. **Cold tests and visual review.** Maintainers give the prompt and module to coding agents on games they have never
   seen, check the results, and review the demo and the wired-in games screen by screen. Expect a round or two of fixes.
5. **Published.** The element gets its page, its card in the catalog and its test records.

Something broke instead? Use the [Element broke my game](https://github.com/lucemia/game-dna/issues/new?template=element-broke-my-game.yml) form.

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
