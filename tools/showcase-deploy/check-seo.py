"""Validate canonicals and JSON-LD in a staged showcase build (offline; no Google API).

usage: python3 -I tools/showcase-deploy/check-seo.py [OUT] [--origin https://game-dna.pages.dev]

Canonical: every showcase page (site/preview/**/index.html) and the root redirect page has exactly one
<link rel="canonical">, on --origin; a showcase page's canonical is its own URL; with a sitemap.xml (public build)
every sitemap URL is the canonical of exactly the page it names, and every canonical of a showcase page is in the sitemap.

JSON-LD (every .html in OUT), following Google Search Central's structured-data rules for the types used:
  all       parseable JSON in <script type="application/ld+json">, @context https://schema.org, every URL-valued property
            (url, @id, image, codeRepository, license, mainEntityOfPage, sameAs) absolute https; a URL on --origin names a
            file that ships in OUT; dates ISO 8601
  Article / BlogPosting   (no required properties) recommended headline, image, datePublished, dateModified, author
            (name, url); dateModified >= datePublished; image >= 50,000 pixels (read from the shipped file), headline
            <= 110 characters (warning)
  WebSite   (site names) on the home page, name and url, url = the home page canonical
  ItemList  (carousel, summary-page form) itemListElement of ListItem, each with integer position 1..n (unique, in
            order) and url; all urls on the page's domain; name recommended (warning)
  SoftwareSourceCode / CreativeWork  (no Google rich result; schema.org) name, description, url; codeRepository,
            license absolute
  Person    name required, url recommended
Exit 1 on any error; warnings are printed but do not fail.
"""
import json, os, re, struct, sys, urllib.parse
from datetime import date, datetime

args = [a for a in sys.argv[1:]]
ORIGIN = 'https://game-dna.pages.dev'
if '--origin' in args:
    i = args.index('--origin'); ORIGIN = args[i + 1].rstrip('/'); del args[i:i + 2]
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = args[0] if args else os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(HERE))), 'game-dna-public-dist')
errors, warns, stats = [], [], {'pages': 0, 'canonical': 0, 'jsonld_blocks': 0, 'types': {}}
err = lambda page, m: errors.append(f'{page}: {m}')
warn = lambda page, m: warns.append(f'{page}: {m}')

URL_KEYS = {'url', '@id', 'image', 'codeRepository', 'license', 'mainEntityOfPage', 'sameAs'}
ISO = re.compile(r'^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$')


def local(u):
    """file in OUT that a URL on ORIGIN names, or None"""
    p = urllib.parse.urlsplit(u).path.lstrip('/')
    p = urllib.parse.unquote(p)
    return os.path.join(OUT, p + 'index.html' if p.endswith('/') or p == '' else p)


def img_pixels(f):
    with open(f, 'rb') as fh:
        b = fh.read()
    if b[:8] == b'\x89PNG\r\n\x1a\n':
        w, h = struct.unpack('>II', b[16:24]); return w * h
    if b[:2] == b'\xff\xd8':
        i = 2
        while i < len(b):
            if b[i] != 0xFF:
                i += 1; continue
            m = b[i + 1]
            if m in (0xC0, 0xC1, 0xC2):
                h, w = struct.unpack('>HH', b[i + 5:i + 9]); return w * h
            i += 2 + struct.unpack('>H', b[i + 2:i + 4])[0]
    if b[:4] == b'RIFF' and b[8:12] == b'WEBP':
        if b[12:16] == b'VP8X':
            return (int.from_bytes(b[24:27], 'little') + 1) * (int.from_bytes(b[27:30], 'little') + 1)
    return None


def check_url(page, key, u):
    if not isinstance(u, str) or not u.startswith('https://'):
        err(page, f'{key} not an absolute https URL: {u!r}'); return
    if u.startswith(ORIGIN + '/') or u == ORIGIN:
        f = local(u.split('#')[0])
        if not os.path.isfile(f):
            err(page, f'{key} {u} names no shipped file')


def walk_urls(page, o):
    if isinstance(o, dict):
        for k, v in o.items():
            if k in URL_KEYS:
                for x in (v if isinstance(v, list) else [v]):
                    if isinstance(x, dict):
                        walk_urls(page, x)
                    else:
                        check_url(page, k, x)
            elif k in ('datePublished', 'dateModified', 'dateCreated', 'uploadDate'):
                if not (isinstance(v, str) and ISO.match(v)):
                    err(page, f'{k} not ISO 8601: {v!r}')
            else:
                walk_urls(page, v)
    elif isinstance(o, list):
        for x in o:
            walk_urls(page, x)


def nodes(o):
    if isinstance(o, list):
        for x in o:
            yield from nodes(x)
    elif isinstance(o, dict):
        if '@graph' in o:
            yield from nodes(o['@graph'])
        if '@type' in o:
            yield o


def person(page, p, role):
    if not isinstance(p, dict) or p.get('@type') not in ('Person', 'Organization'):
        err(page, f'{role} is not a Person / Organization'); return
    if not p.get('name'):
        err(page, f'{role} has no name')
    if not p.get('url'):
        warn(page, f'{role} has no url (recommended)')


def as_date(s):
    return datetime.fromisoformat(s.replace('Z', '+00:00')) if 'T' in s else datetime.combine(date.fromisoformat(s), datetime.min.time())


canon_of = {}   # page URL -> canonical
for d, _, fs in os.walk(OUT):
    for f in fs:
        if not f.endswith('.html'):
            continue
        rel = os.path.relpath(os.path.join(d, f), OUT).replace(os.sep, '/')
        s = open(os.path.join(d, f), encoding='utf-8', errors='replace').read()
        showcase = rel.startswith('site/preview/') and rel.endswith('index.html')
        cans = re.findall(r'<link rel="canonical" href="([^"]+)"', s)
        if showcase or rel == 'index.html':
            stats['pages'] += 1
            if len(cans) != 1:
                err(rel, f'{len(cans)} canonical links')
            else:
                stats['canonical'] += 1
                c = cans[0]
                if not c.startswith(ORIGIN + '/'):
                    err(rel, f'canonical {c} not on {ORIGIN}')
                own = ORIGIN + '/' + rel[:-len('index.html')]
                if showcase and c != own:
                    err(rel, f'canonical {c} is not the page itself ({own})')
                if rel == 'index.html' and c != ORIGIN + '/site/preview/':
                    err(rel, f'root redirect canonical {c}')
                canon_of[ORIGIN + '/' + rel[:-len('index.html')]] = c
        elif len(cans) > 1:
            err(rel, f'{len(cans)} canonical links')
        for m in re.finditer(r'<script type="application/ld\+json">(.*?)</script>', s, re.S):
            stats['jsonld_blocks'] += 1
            try:
                j = json.loads(m.group(1))
            except ValueError as ex:
                err(rel, f'JSON-LD does not parse: {ex}'); continue
            if j.get('@context') not in ('https://schema.org', 'https://schema.org/'):
                err(rel, f'@context {j.get("@context")!r}')
            walk_urls(rel, j)
            page_url = cans[0] if cans else None
            for n in nodes(j):
                t = n['@type']
                stats['types'][t] = stats['types'].get(t, 0) + 1
                if t in ('Article', 'BlogPosting', 'NewsArticle'):
                    for k in ('headline', 'image', 'datePublished', 'dateModified', 'author'):
                        if not n.get(k):
                            err(rel, f'{t} lacks recommended {k}')
                    if len(n.get('headline', '')) > 110:
                        warn(rel, f'{t} headline over 110 characters')
                    if n.get('author'):
                        for a in (n['author'] if isinstance(n['author'], list) else [n['author']]):
                            person(rel, a, 'author')
                    if n.get('publisher'):
                        person(rel, n['publisher'], 'publisher')
                    if n.get('datePublished') and n.get('dateModified') and ISO.match(n['datePublished']) and ISO.match(n['dateModified']):
                        if as_date(n['dateModified']) < as_date(n['datePublished']):
                            err(rel, 'dateModified before datePublished')
                    for im in (n.get('image') if isinstance(n.get('image'), list) else [n.get('image')]):
                        im = im.get('url') if isinstance(im, dict) else im
                        if isinstance(im, str) and im.startswith(ORIGIN + '/') and os.path.isfile(local(im)):
                            px = img_pixels(local(im))
                            if px is None or px < 50000:
                                err(rel, f'image {im} below 50,000 pixels ({px})')
                    me = n.get('mainEntityOfPage')
                    me = me.get('@id') if isinstance(me, dict) else me
                    if page_url and me and me != page_url:
                        err(rel, f'mainEntityOfPage {me} is not the canonical {page_url}')
                elif t == 'WebSite':
                    for k in ('name', 'url'):
                        if not n.get(k):
                            err(rel, f'WebSite lacks {k}')
                    if page_url and n.get('description') is not None and n.get('url') != ORIGIN + '/site/preview/':
                        err(rel, f'WebSite url {n.get("url")} is not the home page')
                elif t == 'ItemList':
                    items = n.get('itemListElement')
                    if not isinstance(items, list) or not items:
                        err(rel, 'ItemList without itemListElement'); continue
                    if not n.get('name'):
                        warn(rel, 'ItemList without name')
                    host = urllib.parse.urlsplit(page_url or ORIGIN).netloc
                    for k, it in enumerate(items, 1):
                        if it.get('@type') != 'ListItem':
                            err(rel, f'item {k} is not a ListItem')
                        if it.get('position') != k or not isinstance(it.get('position'), int):
                            err(rel, f'item {k} position {it.get("position")!r}')
                        if not it.get('url'):
                            err(rel, f'item {k} without url')
                        elif urllib.parse.urlsplit(it['url']).netloc != host:
                            err(rel, f'item {k} url {it["url"]} not on the page domain')
                        if not it.get('name'):
                            warn(rel, f'item {k} without name')
                    if n.get('numberOfItems') not in (None, len(items)):
                        err(rel, f'numberOfItems {n.get("numberOfItems")} != {len(items)}')
                elif t in ('SoftwareSourceCode', 'CreativeWork'):
                    for k in ('name', 'description', 'url'):
                        if not n.get(k):
                            err(rel, f'{t} lacks {k}')
                    if n.get('author'):
                        person(rel, n['author'], 'author')
                elif t == 'Person':
                    if not n.get('name'):
                        err(rel, 'Person without name')

# sitemap <-> canonicals
sm = os.path.join(OUT, 'sitemap.xml')
if os.path.exists(sm):
    locs = re.findall(r'<loc>([^<]+)</loc>', open(sm).read())
    stats['sitemap_urls'] = len(locs)
    for u in locs:
        if canon_of.get(u) != u:
            err('sitemap.xml', f'{u}: page canonical {canon_of.get(u)}')
    for u, c in canon_of.items():
        if u.startswith(ORIGIN + '/site/preview/') and c not in locs:
            err('sitemap.xml', f'canonical {c} not in the sitemap')
print(json.dumps({'origin': ORIGIN, **stats, 'errors': len(errors), 'warnings': len(warns),
                  'first_errors': errors[:20], 'first_warnings': warns[:20]}, indent=1))
sys.exit(1 if errors else 0)
