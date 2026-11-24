"""Static checks on a --public build folder (run after build-staging.py --public and crawl.py on that folder).

usage: python3 -I tools/showcase-deploy/check-public.py [OUT] [CRAWL.json]
Checks: no noindex anywhere except 404.html (robots metas, _headers), robots.txt allows + names the sitemap, no internal
pages or excluded folders shipped, every sitemap URL answers 200 when OUT is served as root, no model names in shipped
text files (rendered cold-test / reviewer wording is the crawl's visible check), and (with CRAWL.json) 0 non-200 requests, failed requests, page errors and visible-name hits.
"""
import functools, json, os, re, sys, threading, urllib.request
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(HERE))), 'game-dna-public-dist')
CRAWL = sys.argv[2] if len(sys.argv) > 2 else None
bad = {}
add = lambda k, v: bad.setdefault(k, []).append(v)

files, total = [], 0
for d, _, fs in os.walk(OUT):
    for f in fs:
        p = os.path.join(d, f)
        files.append(os.path.relpath(p, OUT)); total += os.path.getsize(p)
for r in files:
    if re.search(r'(^|/)(internal|site-review|coldtests|judge|review)(/|$)', r) and not r.startswith('elements/painted-parallax/checks/'):
        add('internal', r)
    if r.endswith('.html') and r != '404.html':
        s = open(os.path.join(OUT, r), encoding='utf-8', errors='replace').read()
        if re.search(r'<meta[^>]+name="robots"[^>]*noindex', s, re.I):
            add('noindex_meta', r)
    if r.endswith(('.html', '.js', '.md', '.txt', '.json')) and not r.endswith('three.min.js'):
        s = open(os.path.join(OUT, r), encoding='utf-8', errors='replace').read()
        for m in re.finditer(r'gpt-\d|sol-high', s, re.I):
            add('names', f'{r}: {s[max(0, m.start() - 40):m.end() + 40]!r}')
            break
if 'noindex' not in open(os.path.join(OUT, '404.html')).read():
    add('404', 'not noindex')
if 'x-robots-tag' in open(os.path.join(OUT, '_headers')).read().lower():
    add('headers', 'X-Robots-Tag present')
rb = open(os.path.join(OUT, 'robots.txt')).read()
if 'Allow: /' not in rb or 'Sitemap:' not in rb or 'Disallow' in rb:
    add('robots', rb)

class Q(SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


srv = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Q, directory=OUT))
threading.Thread(target=srv.serve_forever, daemon=True).start()
base = f'http://127.0.0.1:{srv.server_address[1]}'
locs = re.findall(r'<loc>([^<]+)</loc>', open(os.path.join(OUT, 'sitemap.xml')).read())
for u in locs:
    path = '/' + u.split('/', 3)[3]
    try:
        code = urllib.request.urlopen(base + path).status
    except Exception as ex:
        code = str(ex)
    if code != 200:
        add('sitemap', f'{u} {code}')
    if '/internal' in path or '/elements/' in path:
        add('sitemap', f'{u} not a showcase page')
srv.shutdown()

summary = {'files': len(files), 'bytes': total, 'sitemap_urls': len(locs)}
if CRAWL:
    c = json.load(open(CRAWL))
    non200 = {p: v for p, v in c['requests'].items() if any(x not in ('200', '304') for x in v)}
    summary.update(visited=len(c['visited']), requests=len(c['requests']), non200=len(non200), failed=len(c['failed']),
                   pageerrors=len(c['pageerror']), visible_name_hits=len(c['visible']), external=len(c['external']))
    for p in non200: add('crawl_non200', p)
    for x in c['failed']: add('crawl_failed', x['url'])
    for x in c['pageerror']: add('crawl_pageerror', f"{x['page']} {x['text'][:120]}")
    for x in c['visible']: add('crawl_visible', f"{x['page']} {x['hit']}")
print(json.dumps({'summary': summary, 'problems': {k: (len(v), v[:8]) for k, v in bad.items()}}, indent=1, ensure_ascii=False))
sys.exit(1 if bad else 0)
