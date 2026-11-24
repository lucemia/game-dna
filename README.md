# Game DNA

**Playable game elements your coding agent can drop into any browser game.**

Hit numbers that pop, ATB battles, dynamic lights, card battles, grappling hooks, 3D kart racing: 101 elements, each one
a playable demo, a small dependency-free module (MIT) and a prompt that tells an AI coding agent how to wire it into a
game it has never seen.

Site: https://game-dna.pages.dev · Repository: https://github.com/lucemia/game-dna

How every element is built and tested (cold tests on unseen games, a judge that plays, a strict visual review):
https://game-dna.pages.dev/site/preview/blog/how-game-dna-works/

## Use an element in 3 steps

1. **Pick one** on the site (or in `elements/`) and play its demo: `elements/<id>/demo/index.html`.
2. **Hand your agent two things**: `elements/<id>/prompt.md` and the module file in `elements/<id>/module/`.
   Systems (battles, map flows) also come with a ready-to-extend starter game in `elements/<id>/starter/`.
3. **Say "add this to my game"** and let it work. The prompt lists where it hooks in, the common mistakes and how to
   check the result without a browser.

## Combine several

The Basket page on the site checks which elements fit together and gives you one prompt plus a zip. From the command line:

```sh
node tools/combine.mjs damage-pop bloom-glow squash-stretch --out my-combo     # one COMBO.md + the modules
node tools/combine.mjs card-battle damage-pop --starter --out my-card-game      # start from a system's starter game
node tools/combine.mjs damage-pop bloom-glow --check                            # compatibility only
```

Ready-made combos live in `combos/`. Details: `tools/README.md`.

## Build the site

```sh
node tools/build-site.mjs --preview      # regenerates site/preview/ from elements/ and site/assets/
python3 -m http.server 8000              # from the repo root, then open http://localhost:8000/site/preview/
```

Node 18+ and Python 3, no installs. `tools/showcase-deploy/` builds a static upload folder for any static host.

## Licence and art

Code, modules and prompts: MIT (`LICENSE`). Bundled third-party code: `THIRD-PARTY-NOTICES.txt` (three.js, MIT).
Most art is drawn in code. Some demo art was made with an AI image generator and is marked ✦ AI art on the site;
what came from where is in `PROVENANCE.md`. The modules themselves never call an image generator.
