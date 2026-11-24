# Showcase deploy (unlisted preview, or public with `--public`)

Builds the upload folder for the Cloudflare Pages project `game-dna-preview` (https://game-dna-preview.pages.dev/):
only the showcase (`site/preview/`, without `site/preview/internal/`) and the demo / module / art files it loads.
Never edits the repo.

```sh
# from the repo root; the output folder is OUTSIDE the repo (default ../game-dna-preview-dist)
python3 -I tools/showcase-deploy/build-staging.py
# if pages or demos changed what they load, re-crawl first (repo served as root), then build:
uv run --with playwright==1.65.0 python -I tools/showcase-deploy/crawl.py . /site/preview/ tools/showcase-deploy/crawl-repo.json
uv run --with playwright==1.65.0 python -I tools/showcase-deploy/crawl.py . /site/preview/ tools/showcase-deploy/crawl-demos.json --direct-demos
```

What the build adds to the upload folder only: the robots meta in every page, `_headers` (`X-Robots-Tag: noindex,
nofollow`), `robots.txt` (`Disallow: /`), `_redirects` (`/` to `/site/preview/`), a noindex `404.html` (without it Pages
answers unknown paths with the root page and status 200), `LICENSE`, `THIRD-PARTY-NOTICES.txt`; it removes the
"Build records" links to internal pages and scrubs model names and cold-test notes from rendered text.

Deploy (the owner runs it in their own terminal; tokens never go through an agent session):

```sh
npx wrangler@4 login
npx wrangler@4 pages deploy ../game-dna-preview-dist --project-name game-dna-preview --branch main
```

Check afterwards: `curl -sI https://game-dna-preview.pages.dev/ | grep -i x-robots`, `curl -s .../robots.txt`,
`curl -sI .../site/preview/internal/ | head -1` (404).

## Public build (`--public`)

Indexable launch build, written to `../game-dna-public-dist` (outside the repo). Same file selection and staging scrubs
(model names, cold-test notes, Build records links) as the preview, plus: no robots meta in any page, `_headers` without
`X-Robots-Tag` (security headers and asset cache headers only), `robots.txt` = `Allow: /` + `Sitemap:`, `sitemap.xml`
(home, every element page, start, basket, styles, tests, about), a public `llms.txt` (the repo's `site/llms.txt` / `site/catalog.json`
are not used by the showcase and are not shipped), `PROVENANCE.md` (which demos show AI art, the tool, and that the L-10
cutout characters and the demo-kit heroes were generated with reference images; linked from About). `404.html` stays
noindex. Share cards (`og:url`, `og:image`, `twitter:image`) are written with the preview origin at site build time;
the staging copy rewrites them to `--origin` (the preview build keeps the preview origin). `--origin` is a placeholder (`https://game-dna.pages.dev`) until the project or domain is picked; rebuild with
the real one before deploying. Reports: `manifest-public.tsv`, `skipped-public.tsv`, `scrubbed-public.json`,
`exceptions-public.json`.

```sh
python3 -I tools/showcase-deploy/build-staging.py --public --origin https://game-dna.pages.dev
uv run --with playwright==1.65.0 python -I tools/showcase-deploy/crawl.py ../game-dna-public-dist /site/preview/ /tmp/crawl-public.json
python3 -I tools/showcase-deploy/check-public.py ../game-dna-public-dist /tmp/crawl-public.json   # exit 0 = clean
```

Deploy (owner, own terminal):

```sh
npx wrangler@4 pages project create game-dna --production-branch main   # once
npx wrangler@4 pages deploy ../game-dna-public-dist --project-name game-dna --branch main
```

## Visitor counts (Cloudflare Web Analytics, owner only)

No code change and no script in the repo. In the Cloudflare dashboard: Workers & Pages → the Pages project (`game-dna`)
→ Metrics → Web Analytics → Enable. Cloudflare then injects its beacon at the edge on the next deploy. It sets no
cookies and keeps no personal data (page views, referrers, countries, device types, Core Web Vitals only). Nothing else
is tracked: the site has no other analytics, no cookies, no third-party requests (fonts are self-hosted) and the basket
keeps its state in the visitor's own browser (localStorage and the URL). To turn it off, Disable in the same place.
