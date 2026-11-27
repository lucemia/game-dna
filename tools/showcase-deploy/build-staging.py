"""Build the Cloudflare Pages upload folder for the Game DNA showcase. Never edits the repo.

usage: python3 -I tools/showcase-deploy/build-staging.py [--repo .] [--crawl crawl-repo.json ...] [--out ../game-dna-preview-dist]
       python3 -I tools/showcase-deploy/build-staging.py --public [--origin https://game-dna.pages.dev] [--out ../game-dna-public-dist]
(the output folder must be OUTSIDE the repo; it is what `wrangler pages deploy` uploads)

Default = the unlisted preview (noindex everywhere). --public = the indexable launch build: no robots meta, no
X-Robots-Tag, robots.txt Allow + Sitemap, sitemap.xml (home, every element page, start, basket, styles, tests, about, the blog post), a public
llms.txt, llms-full.txt, catalog.json and PROVENANCE.md at the root (PROVENANCE linked from About), 404.html still noindex.
Both builds: <link rel="canonical"> and JSON-LD URLs point at --canonical-origin (default the public site), so the
unlisted preview names the public pages as canonical. Reports go to *-public.* files.

What ships (the staging root mirrors the repo root, so every relative URL keeps working; `/` redirects to
/site/preview/):
  1. site/preview/** except site/preview/internal/**
  2. every same-origin path the crawl (crawl.py, repo served as root) saw with status 200
  3. every file the basket can put in its zip (node basketfiles.js: Core.run over every element, alone,
     with its starter and in every pair) plus skins/skin-api.js and every style file in DNA_STYLES
  4. static references, to a fixpoint: src/href/url(...) in HTML/CSS and quoted relative paths with a known
     file extension in HTML/JS, resolved against the file (and, for JS, against each HTML page that loads it)
Excluded even when referenced (reported): internal/, site-review/, coldtests/, judge/, review/, any checks/ or
shots/ folder, element.md / element.json / meta.json / GEN.md / prompt-pack.md / coldtest*, *.py, *.sh, *.mjs build tools.
Staging-only edits: robots meta in every .html, the "Build records" links to internal/ removed, share-card URLs
(og:url / og:image / twitter:image) pointed at --origin (public) or the preview origin,
_headers (X-Robots-Tag), robots.txt, _redirects, root index.html redirect, and THIRD-PARTY notices.
"""
import argparse, json, os, re, shutil, subprocess, sys, urllib.parse
import html

HERE = os.path.dirname(os.path.abspath(__file__))
ap = argparse.ArgumentParser()
ap.add_argument('--repo', default=os.path.dirname(os.path.dirname(HERE)))
ap.add_argument('--crawl', nargs='*', default=[os.path.join(HERE, 'crawl-repo.json'), os.path.join(HERE, 'crawl-demos.json')])
ap.add_argument('--out', default=None)
ap.add_argument('--public', action='store_true', help='indexable launch build (see the docstring)')
ap.add_argument('--origin', default='https://game-dna.pages.dev', help='public origin for sitemap / robots / llms.txt (placeholder until the project or domain is picked)')
ap.add_argument('--canonical-origin', default='https://game-dna.pages.dev', help='origin of <link rel="canonical"> and JSON-LD URLs (both builds)')
ap.add_argument('--basket-js', default=os.path.join(HERE, 'basketfiles.js'))
A = ap.parse_args()
REPO = os.path.realpath(A.repo)
PUBLIC, ORIGIN, CANON = A.public, A.origin.rstrip('/'), A.canonical_origin.rstrip('/')
if A.out is None:
    A.out = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(HERE))), 'game-dna-public-dist' if PUBLIC else 'game-dna-preview-dist')
SUF = '-public' if PUBLIC else ''
if PUBLIC and subprocess.run(['git', '-C', REPO, 'status', '--porcelain', '--', 'site', 'elements', 'demo-kit'], capture_output=True, text=True).stdout.strip():
    print('warning: uncommitted changes under site/ elements/ demo-kit/ are included in this build', file=sys.stderr)

EXCL_DIR = re.compile(r'(^|/)(internal|site-review|coldtests|judge|review|checks|shots|node_modules|\.git|refs|tools)(/|$)')
EXCL_FILE = re.compile(r'(^|/)(element\.md|element\.json|meta\.json|GEN\.md|PROMPT\.md|style-lock\.txt|prompt-pack\.md|catalog-src\.json|coldtest[^/]*|build-manifest\.sh|SHARED-CHANGES\.md|CHANGES\.md|REPORT\.md)$|\.(py|sh|mjs|jsonl|log)$')
ASSET_EXT = r'(?:js|css|html|md|json|png|webp|jpg|jpeg|gif|svg|mp3|ogg|wav|m4a|glb|gltf|bin|ttf|woff2?|otf|txt|wasm)'


def excluded(rel):
    if rel.startswith('site/preview/internal'):
        return 'internal'
    m = EXCL_DIR.search(rel)
    if m and not rel.startswith('site/preview/'):
        return 'dir:' + m.group(2)
    if EXCL_FILE.search(rel):
        return 'file'
    return None


def norm(rel):
    rel = os.path.normpath(rel).replace(os.sep, '/')
    if rel.startswith('..') or rel.startswith('/'):
        return None
    p = os.path.join(REPO, rel)
    if os.path.isdir(p):
        rel = (rel.rstrip('/') + '/index.html').lstrip('./') if rel != '.' else 'index.html'
        p = os.path.join(REPO, rel)
    return rel if os.path.isfile(p) else None


need, why, skipped, exceptions = set(), {}, {}, {}


def add(rel, reason):
    r = norm(rel)
    if not r:
        return False
    x = excluded(r)
    if x and x in ('dir:checks', 'dir:shots') and re.search(r'\.(png|webp|jpe?g)$', r) and (reason == 'crawl' or reason.startswith('static:')):
        exceptions.setdefault(r, reason)   # a demo really shows this image (e.g. before/after screenshots)
        x = None
    if not x and '/assets/gen/' in r and reason.startswith('static:'):
        x = 'raw generator output (named in a pack manifest, never loaded; untracked in git)'
    if x:
        skipped.setdefault(r, set()).add(f'{x} <- {reason}')
        return False
    if r not in need:
        need.add(r)
        why[r] = reason
        return True
    return False


# 1. showcase pages
for d, _, fs in os.walk(os.path.join(REPO, 'site/preview')):
    for f in fs:
        rel = os.path.relpath(os.path.join(d, f), REPO)
        if not rel.startswith('site/preview/internal'):
            add(rel, 'showcase')
# 1b. home hero: showcase.js loads hero/<id>.webp and hero/<id>-poster.webp for every item of the data-hero JSON (ids
# only, HTML-escaped, so neither the static scan nor a short crawl sees them; 10 of 12 were missing on 2026-11-27)
HERO_ATTR = re.compile(r"data-hero='([^']*)'")
HERO_POSTER = re.compile(r"""url\('([^']*/)[^/']+-poster\.webp'\)""")
hero_need = []
for d, _, fs in os.walk(os.path.join(REPO, 'site/preview')):
    for f in fs:
        if not f.endswith('.html'):
            continue
        rel = os.path.relpath(os.path.join(d, f), REPO)
        if rel.startswith('site/preview/internal'):
            continue
        s = open(os.path.join(REPO, rel), encoding='utf-8').read()
        m = HERO_ATTR.search(s)
        if not m:
            continue
        pm = HERO_POSTER.search(s[m.end():])
        if not pm:
            sys.exit(f'{rel}: data-hero without a poster url to take the hero folder from')
        for it in json.loads(html.unescape(m.group(1))):
            for suf in ('.webp', '-poster.webp'):
                h = os.path.normpath(os.path.join(os.path.dirname(rel), pm.group(1) + it['id'] + suf)).replace(os.sep, '/')
                add(h, 'hero:' + rel)
                hero_need.append(h)
# 2. crawl
for c in A.crawl:
    if not os.path.exists(c):
        print('missing crawl', c, file=sys.stderr)
        continue
    for p, codes in json.load(open(c))['requests'].items():
        if '200' in codes or '304' in codes:
            add(p.lstrip('/'), 'crawl')
# 3. basket zip files
try:
    out = subprocess.run(['node', A.basket_js, os.path.join(REPO, 'site/assets')], capture_output=True, text=True, check=True).stdout
    for p in out.split():
        add(p, 'basket-zip')
except Exception as ex:
    print('basket files failed', ex, file=sys.stderr)
styles_src = open(os.path.join(REPO, 'site/assets/basket-data.js'), encoding='utf-8').read()
add('skins/skin-api.js', 'basket-zip-style')
for m in re.finditer(r'"file":"(skins/[^"]+)"', styles_src):
    add(m.group(1), 'basket-zip-style')

# licence text for the bundled three.js (the .min.js banner alone is not the full MIT notice)
add('vendor/three@0.149.0/LICENSE', 'licence')

# catalog (public build): every page / prompt / module / demo it names must ship
CATALOG = json.load(open(os.path.join(REPO, 'site/preview/catalog-src.json'), encoding='utf-8'))['elements']
if PUBLIC:
    for c in CATALOG:
        for k, v in c['paths'].items():
            if v and not add(v, 'catalog') and norm(v) not in need:
                print(f'catalog: {c["id"]} {k} {v} cannot ship', file=sys.stderr)

# 4. static references to a fixpoint
ATTR = re.compile(r'''(?:src|href|data-copy-url|poster|data-src)\s*=\s*["']([^"'#][^"']*)["']''')
CSSURL = re.compile(r'''url\(\s*["']?([^"')]+)["']?\s*\)''')
LIT = re.compile(r'''["'`]((?:\.{1,2}/|[A-Za-z0-9_@\-])[A-Za-z0-9_@.\-/]*\.''' + ASSET_EXT + r''')(?:[?#][^"'`]*)?["'`]''')
includers = {}
done = set()
while True:
    todo = sorted(r for r in need - done if re.search(r'\.(html|js|css)$', r))
    if not todo:
        break
    for r in todo:
        done.add(r)
        try:
            s = open(os.path.join(REPO, r), encoding='utf-8', errors='replace').read()
        except Exception:
            continue
        if len(s) > 3_000_000 and r.endswith('.js'):
            s = s[:200_000]  # data-URI bundles: scan the head only
        base = os.path.dirname(r)
        refs = []
        if r.endswith('.html'):
            refs += ATTR.findall(s)
        refs += CSSURL.findall(s) if r.endswith(('.css', '.html')) else []
        lits = LIT.findall(s) if r.endswith(('.html', '.js')) else []
        for u in refs + lits:
            u = urllib.parse.unquote(urllib.parse.urlsplit(u).path) if '://' not in u and not u.startswith(('data:', 'blob:', 'mailto:', '//')) else None
            if not u or u.startswith('/'):
                continue
            bases = [base] + (includers.get(r, []) if r.endswith('.js') else [])
            for b in bases:
                t = norm(os.path.join(b, u))
                if t:
                    if t.endswith('.js') and r.endswith('.html'):
                        includers.setdefault(t, []).append(base)
                    add(t, 'static:' + r)
                    break

# build
if os.path.exists(A.out):
    shutil.rmtree(A.out)
ROBOTS = '<meta name="robots" content="noindex, nofollow">'
INTERNAL_A = re.compile(r'<a class="sc-internal-link" href="[^"]*internal/">[^<]*</a>')
RECORDS = re.compile(r'<section class="sc-sec sc-tight"><div class="sc-wrap"><a class="sc-records" href="[^"]*internal/[^"]*">.*?</a></div></section>', re.S)
# element pages now put the anchor after "Request an element" (not in its own section): strip the anchor itself too
RECORDS_A = re.compile(r'<a class="sc-records" href="[^"]*internal/[^"]*">.*?</a>', re.S)
edits = {'robots_meta': 0, 'internal_links_removed': 0, 'share_urls_rewritten': 0, 'canonical_urls_rewritten': 0}
# share cards (og:url, og:image, twitter:image) carry absolute URLs from GAME_DNA_ORIGIN at site build time (default the
# preview origin, tools/site-preview.mjs); the staging copy points them at this build's origin: --origin for --public,
# the preview origin otherwise
PREVIEW_ORIGIN = 'https://game-dna-preview.pages.dev'
SHARE_ORIGIN = ORIGIN if PUBLIC else PREVIEW_ORIGIN
CANON_URL = re.compile(r'(<link rel="canonical" href=")https?://[^/"]+(/site/preview/)')
LDJSON = re.compile(r'(<script type="application/ld\+json">)(.*?)(</script>)', re.S)
LD_URL = re.compile(r'(")https?://[^/"]+(/site/preview/)')
SHARE_URL = re.compile(r'(<meta (?:property|name)="(?:og:url|og:image|twitter:image)" content=")https?://[^/"]+(/site/preview/)')
PROV_LINK = ('<p>Where the AI pictures came from, element by element: <a href="../../../PROVENANCE.md">PROVENANCE.md</a>.</p>')
for r in sorted(need):
    src, dst = os.path.join(REPO, r), os.path.join(A.out, r)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    if r.endswith('.html'):
        s = open(src, encoding='utf-8').read()
        n0 = len(INTERNAL_A.findall(s)) + len(RECORDS.findall(s))
        s = RECORDS.sub('', INTERNAL_A.sub('', s))
        s, n = RECORDS_A.subn('', s)
        n0 += n
        edits['internal_links_removed'] += n0
        s, n = SHARE_URL.subn(lambda m: m.group(1) + SHARE_ORIGIN + m.group(2), s)
        edits['share_urls_rewritten'] += n
        s, n = CANON_URL.subn(lambda m: m.group(1) + CANON + m.group(2), s)
        edits['canonical_urls_rewritten'] += n
        s = LDJSON.sub(lambda m: m.group(1) + LD_URL.sub(lambda u: u.group(1) + CANON + u.group(2), m.group(2)) + m.group(3), s)
        if PUBLIC:
            s, n = re.subn(r'\s*<meta name="robots" content="[^"]*">', '', s)
            edits['robots_meta'] -= 1 - n   # counts removed metas in public mode
            if r == 'site/preview/about/index.html':
                s = re.sub(r'(<article id="credits">.*?)(</article>)', lambda m: m.group(1) + PROV_LINK + m.group(2), s, count=1, flags=re.S)
        elif 'name="robots"' in s:
            s = re.sub(r'<meta name="robots" content="[^"]*">', ROBOTS, s)
        elif re.search(r'<head[^>]*>', s, re.I):
            s = re.sub(r'(<head[^>]*>)', r'\1\n' + ROBOTS, s, count=1, flags=re.I)
        else:
            s = ROBOTS + '\n' + s
        edits['robots_meta'] += 1
        open(dst, 'w', encoding='utf-8').write(s)
    else:
        shutil.copy2(src, dst)

W = lambda p, s: open(os.path.join(A.out, p), 'w', encoding='utf-8').write(s)
if PUBLIC:
    W('_headers', '/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n'
      '/site/assets/*\n  Cache-Control: public, max-age=86400\n/site/preview/assets/*\n  Cache-Control: public, max-age=3600\n'
      '/demo-kit/*\n  Cache-Control: public, max-age=86400\n/vendor/*\n  Cache-Control: public, max-age=604800\n'
      '/*.md\n  Content-Type: text/markdown; charset=utf-8\n')
    W('robots.txt', f'User-agent: *\nAllow: /\nSitemap: {ORIGIN}/sitemap.xml\n')
    # Google Search Console ownership file for game-dna.pages.dev: must stay at the root of every public upload
    W('google18a8ae3ff3abdb23.html', 'google-site-verification: google18a8ae3ff3abdb23.html')
else:
    W('_headers', '/*\n  X-Robots-Tag: noindex, nofollow\n')
    W('robots.txt', 'User-agent: *\nDisallow: /\n')
W('_redirects', '/ /site/preview/ 302\n')
# 404 page: without it Pages serves the root index.html for every unknown path (SPA fallback), so /site/preview/internal/
# answered 200. A real 404.html (noindex) makes unknown paths 404.
W('404.html', '<!doctype html><html lang="en"><head><meta charset="utf-8">' + ROBOTS +
  '<meta name="viewport" content="width=device-width, initial-scale=1"><title>Not found · Game DNA</title>'
  '<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0d0b14;color:#e8e4f0;'
  'font:16px/1.5 system-ui,sans-serif;padding:16px;text-align:center}a{color:#ffb36b}</style></head>'
  '<body><main><h1>Page not found</h1><p><a href="/site/preview/">Back to Game DNA</a></p></main></body></html>\n')
W('index.html', '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
  f'<link rel="canonical" href="{CANON}/site/preview/">' + ('' if PUBLIC else ROBOTS) +
  '<meta http-equiv="refresh" content="0; url=site/preview/"><title>Game DNA</title></head>'
  '<body><a href="site/preview/">Game DNA</a></body></html>\n')
# third-party notices next to the bundled copy already exist (vendor/three@0.149.0/LICENSE); add a site-level notice file
W('THIRD-PARTY-NOTICES.txt', open(os.path.join(HERE, 'THIRD-PARTY-NOTICES.txt'), encoding='utf-8').read()
  if os.path.exists(os.path.join(HERE, 'THIRD-PARTY-NOTICES.txt')) else '')

# project licence at the root (the About page points to it)
shutil.copy2(os.path.join(REPO, 'LICENSE'), os.path.join(A.out, 'LICENSE'))

if PUBLIC:
    import html as H
    home = open(os.path.join(A.out, 'site/preview/index.html'), encoding='utf-8').read()
    cards = {}   # id -> (name, AI-art title or None), from the gallery cards
    for m in re.finditer(r'<a class="sc-card[^"]*" href="\./dna/([^/"]+)/"[^>]*>(.*?)</a>', home, re.S):
        nm = re.search(r'class="sc-card-name">([^<]*)<', m.group(2))
        gen = re.search(r'class="sc-gen" title="([^"]*)"', m.group(2))
        cards[m.group(1)] = (H.unescape(nm.group(1)) if nm else m.group(1), H.unescape(gen.group(1)) if gen else None)
    dna = sorted(e for e in os.listdir(os.path.join(A.out, 'site/preview/dna')) if os.path.exists(os.path.join(A.out, 'site/preview/dna', e, 'index.html')))
    urls = [f'{ORIGIN}/site/preview/'] + [f'{ORIGIN}/site/preview/dna/{e}/' for e in dna] + \
           [f'{ORIGIN}/site/preview/{p}/' for p in ('start', 'basket', 'styles', 'tests', 'about', 'blog/how-game-dna-works')]
    W('sitemap.xml', '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      ''.join(f'  <url><loc>{u}</loc></url>\n' for u in urls) + '</urlset>\n')
    W('llms.txt', '# Game DNA\n\n> A library of playable game elements (hit effects, battle systems, lights, menus, 3D scenes) for '
      'browser games built with an AI coding agent. Each element has a playable demo, a small module file (MIT) and a prompt '
      'that tells a coding agent how to add the element to a game it has never seen.\n\n'
      '## How an agent uses it\n\n'
      '1. Pick an element below and fetch its prompt (`prompt.md`, plain Markdown).\n'
      '2. Give the prompt to your coding agent together with your game\'s code; it explains which module file to copy and which '
      'hooks in your game to connect.\n'
      '3. Several elements can be combined: the basket page checks compatibility and builds one combined prompt plus a zip of the '
      'files.\n\n'
      f'- Home: {ORIGIN}/site/preview/\n- Basket (combine elements): {ORIGIN}/site/preview/basket/\n'
      f'- Visual styles: {ORIGIN}/site/preview/styles/\n- How it is built and tested (blog): {ORIGIN}/site/preview/blog/how-game-dna-works/\n'
      f'- About, credits and licences: {ORIGIN}/site/preview/about/\n'
      f'- Art provenance: {ORIGIN}/PROVENANCE.md\n'
      f'- Every element with its description, category, page, prompt, module and demo: {ORIGIN}/llms-full.txt\n'
      f'- The same as JSON (catalog): {ORIGIN}/catalog.json\n\n## Elements (page and prompt)\n\n' +
      ''.join(f'- [{cards.get(e, (e,))[0]}]({ORIGIN}/site/preview/dna/{e}/): prompt {ORIGIN}/site/preview/dna/{e}/prompt.md\n'
              for e in dna if os.path.exists(os.path.join(A.out, 'site/preview/dna', e, 'prompt.md'))))
    # full element list for agents (llms-full.txt) and the public catalog (catalog.json): from the generator's
    # site/preview/catalog-src.json (public fields only), absolute URLs on --origin, every URL a shipped file
    url = lambda rel: None if not rel else ORIGIN + '/' + (rel[:-len('index.html')] if rel.endswith('/index.html') and rel.startswith('site/preview/') else rel)
    shipped = lambda rel: rel is None or os.path.isfile(os.path.join(A.out, rel[:-1] + '/index.html' if rel.endswith('/') else rel))
    cat = []
    for c in CATALOG:
        if c['id'] not in dna:
            continue
        miss = [v for v in c['paths'].values() if not shipped(v)]
        if miss:
            sys.exit(f'catalog: {c["id"]} names files that do not ship: {miss}')
        cat.append({'id': c['id'], 'name': c['name'], 'description': c['description'], 'category': c['category'], 'kind': c['kind'],
                    'aiArt': bool(c['aiArt']), 'urls': {k: url(v) for k, v in c['paths'].items()}})
    W('catalog.json', json.dumps({'name': 'Game DNA', 'url': f'{ORIGIN}/site/preview/', 'repository': 'https://github.com/lucemia/game-dna',
                                  'license': 'MIT', 'count': len(cat), 'elements': cat}, ensure_ascii=False, indent=1) + '\n')
    W('llms-full.txt', '# Game DNA: every element\n\n> Playable game elements for browser games built with an AI coding agent. For each element: '
      'what it does, its category, whether it is an add-on (drops into any game) or a system (a starter game that replaces the '
      'core loop), and the URLs of its page, its prompt (Markdown, give it to your coding agent), its module (JavaScript, MIT) and '
      f'its playable demo. The same list as JSON: {ORIGIN}/catalog.json\n\n' +
      ''.join(f'## {c["name"]}\n\n{next(x["line"] for x in CATALOG if x["id"] == c["id"])}\n\n'
              f'- ID: `{c["id"]}`\n- Category: {c["category"]} ({c["kind"]}){" · uses AI-generated demo art" if c["aiArt"] else ""}\n'
              f'- Page: {c["urls"]["page"]}\n- Prompt: {c["urls"]["prompt"]}\n' +
              (f'- Module: {c["urls"]["module"]}\n' if c['urls']['module'] else '') +
              (f'- Demo: {c["urls"]["demo"]}\n' if c['urls']['demo'] else '') + '\n' for c in cat))
    # which demos use the shared demo-kit cast, and which of those draw the rigged heroes (L-10 rig)
    kit_users, rig_users = set(), set()
    for e in dna:
        f = os.path.join(A.out, 'elements', e, 'demo', 'index.html')
        if os.path.exists(f):
            t = open(f, encoding='utf-8', errors='replace').read()
            if 'demo-kit/' in t: kit_users.add(e)
            if 'cutout-characters/' in t: rig_users.add(e)
    ai = [e for e in dna if cards.get(e, (0, None))[1]]
    L = lambda ids: ''.join(f'- {cards.get(e, (e,))[0]} (`{e}`)\n' for e in sorted(ids))
    W('PROVENANCE.md', '# Art provenance\n\n'
      'Most art in Game DNA is drawn in code. Some demo art was made with an AI image generator: OpenAI image generation, '
      'used through Codex. The game code, the pixel art drawn in code and the prompts are our own. Pages whose demo shows AI '
      'pictures are marked with ✦ AI art. The element modules never call an image generator.\n\n'
      f'## Elements whose demo shows AI-generated pictures ({len(ai)})\n\n' + L(ai) +
      '\n## Layered cutout characters and the shared demo heroes\n\n'
      'The layered cutout characters (`cutout-characters`) and the three rigged demo heroes built from them (sword, spear and '
      'mage, shared by several demos through the demo kit) were generated with reference images: existing artwork was given to '
      'the image generator as visual reference during generation.'
      '\n\nDemos that draw these heroes:\n\n' + L(rig_users) +
      '\n## Shared demo kit\n\nThe painted sprites, props and backgrounds in the shared demo kit are AI-generated. '
      'Demos that use the kit:\n\n' + L(kit_users))

# ---- staging-only scrub of visible / rendered leftovers (the repo originals stay as they are) ----
SCRUB = [  # (regex, replacement) over every staged .html / .js / .md
    (r'Codex image_gen · gpt-\\d+(?:\\.\\d+)?-[a-z]+ · high', 'AI image generator'),
    (r'Codex image_gen \\u00b7 gpt-\\d+(?:\\.\\d+)?-[a-z]+ \\u00b7 high', 'AI image generator'),
    (r'\s*\(gpt-\\d+(?:\\.\\d+)?-[a-z]+, high\)', ''),
    (r'"model"\s*:\s*"gpt-\\d+(?:\\.\\d+)?-[a-z]+"', '"model": "image generator"'),
    (r'"effort"\s*:\s*"high",?\s*', ''),
    (r'gpt-\\d+(?:\\.\\d+)?-[a-z]+', 'an AI image generator'),
]
scrubbed = {}
for d, _, fs in os.walk(A.out):
    for f in fs:
        if not f.endswith(('.html', '.js', '.md')) or f == 'three.min.js':
            continue
        p = os.path.join(d, f)
        s = open(p, encoding='utf-8').read()
        n0 = s
        for rx, rep in SCRUB:
            s = re.sub(rx, rep, s)
        if s != n0:
            open(p, 'w', encoding='utf-8').write(s)
            scrubbed[os.path.relpath(p, A.out)] = 'model name'
# basket data: drop build-history notes (scopeNote, status) that name the test harness or reviews
bd = os.path.join(A.out, 'site/assets/basket-data.js')
if os.path.exists(bd):
    lines = open(bd, encoding='utf-8').read().split('\n')
    pre = 'window.DNA_BASKET_DATA = '
    i = next(k for k, l in enumerate(lines) if l.startswith(pre))
    data = json.loads(lines[i][len(pre):].rstrip().rstrip(';'))
    dropped = []
    for eid, el in data['elements'].items():
        j = el.get('json', {})
        for k in ('scopeNote', 'statusNote'):
            if k in j:
                j.pop(k); dropped.append(f'{eid}.{k}')
        if isinstance(j.get('status'), str) and j['status'] not in ('draft', 'built', 'stable'):
            j['status'] = 'built'; dropped.append(f'{eid}.status')
        for v in j.values():   # assetPack.coldTestLayers names the internal test layers
            if isinstance(v, dict) and v.pop('coldTestLayers', None) is not None:
                dropped.append(f'{eid}.coldTestLayers')
        a = j.get('assets')
        if isinstance(a, dict) and isinstance(a.get('generated'), dict):
            for k in ('model', 'effort'):
                a['generated'].pop(k, None)
    lines[i] = pre + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';'
    open(bd, 'w', encoding='utf-8').write('\n'.join(lines))
    scrubbed['site/assets/basket-data.js'] = 'dropped ' + ', '.join(dropped)
json.dump(scrubbed, open(os.path.join(HERE, 'scrubbed' + SUF + '.json'), 'w'), indent=1)

man = []
for d, _, fs in os.walk(A.out):
    for f in fs:
        p = os.path.join(d, f)
        man.append((os.path.relpath(p, A.out), os.path.getsize(p)))
man.sort()
lost = sorted(set(h for h in hero_need if h not in need))
if lost:
    sys.exit('home hero files missing from the build: ' + ', '.join(lost))
with open(os.path.join(HERE, 'manifest' + SUF + '.tsv'), 'w') as fh:
    fh.write('path\tbytes\treason\n')
    for p, b in man:
        fh.write(f'{p}\t{b}\t{why.get(p, "generated")}\n')
with open(os.path.join(HERE, 'skipped' + SUF + '.tsv'), 'w') as fh:
    for p, rs in sorted(skipped.items()):
        fh.write(f'{p}\t{"; ".join(sorted(rs))[:400]}\n')
json.dump(exceptions, open(os.path.join(HERE, 'exceptions' + SUF + '.json'), 'w'), indent=1)
print(json.dumps({'exceptions': len(exceptions), 'files': len(man), 'bytes': sum(b for _, b in man), 'skipped_refs': len(skipped), **edits}))
