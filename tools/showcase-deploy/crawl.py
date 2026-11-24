"""Crawl the Game DNA showcase served from a local root and record every request.

usage: uv run --with playwright==1.65.0 python -I crawl.py ROOT START_PREFIX OUT.json [--direct-demos]
  ROOT          directory served as http://127.0.0.1:PORT/
  START_PREFIX  URL path of the showcase home, e.g. /site/preview/
Server-side log = every same-origin request (incl. iframes, fetch, workers). Browser-side log = every
request to another origin, failed requests, console errors.
"""
import asyncio, json, os, re, sys, threading, functools, urllib.parse
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.async_api import async_playwright

ROOT, START, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
DIRECT = '--direct-demos' in sys.argv
LOG = []  # (path, status)
LOCK = threading.Lock()


class H(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.js': 'text/javascript', '.mjs': 'text/javascript',
                      '.md': 'text/markdown; charset=utf-8', '.webp': 'image/webp', '.wasm': 'application/wasm'}

    def log_request(self, code='-', size='-'):
        p = urllib.parse.urlsplit(self.path).path
        with LOCK:
            LOG.append((urllib.parse.unquote(p), int(code) if str(code).isdigit() else code))

    def log_message(self, *a):
        pass


srv = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(H, directory=ROOT))
PORT = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = f'http://127.0.0.1:{PORT}'


def showcase_pages():
    d = os.path.join(ROOT, START.strip('/'))
    pages = [START, START + 'about/', START + 'styles/', START + 'basket/', START + 'start/', START + 'tests/']
    blog = os.path.join(d, 'blog')
    if os.path.isdir(blog):
        pages += [f'{START}blog/{b}/' for b in sorted(os.listdir(blog)) if os.path.exists(os.path.join(blog, b, 'index.html'))]
    for e in sorted(os.listdir(os.path.join(d, 'dna'))):
        if os.path.exists(os.path.join(d, 'dna', e, 'index.html')):
            pages.append(f'{START}dna/{e}/')
    return pages


def demo_pages():
    d = os.path.join(ROOT, START.strip('/'))
    out = set()
    for e in sorted(os.listdir(os.path.join(d, 'dna'))):
        f = os.path.join(d, 'dna', e, 'index.html')
        if not os.path.exists(f):
            continue
        s = open(f, encoding='utf-8').read()
        for m in re.finditer(r'<iframe\b[^\n]*?\ssrc="([^"]+)"', s):
            u = urllib.parse.urljoin(f'{START}dna/{e}/', m.group(1))
            out.add(u)
    return sorted(out)


EXT, FAILED, CONSOLE, PAGEERR, VISITED, VIS = [], [], [], [], [], []
VISRX = re.compile(r'gpt-|sol-high|coldtests?|cold[ -]tests?|judge-|\bjudge\b|\bcritics?\b|strict critic|image_gen|codex', re.I)


async def visit(browser, url, width):
    ctx = await browser.new_context(viewport={'width': width, 'height': 900 if width > 500 else 844},
                                    device_scale_factor=1 if width > 500 else 2)
    page = await ctx.new_page()
    ctx.on('request', lambda r: (not r.url.startswith(BASE) and not r.url.startswith(('data:', 'blob:', 'about:')))
           and EXT.append({'page': url, 'w': width, 'url': r.url}))
    ctx.on('requestfailed', lambda r: FAILED.append({'page': url, 'w': width, 'url': r.url, 'err': r.failure}))
    ctx.on('console', lambda m: m.type == 'error' and CONSOLE.append({'page': url, 'w': width, 'text': m.text[:300]}))
    page.on('pageerror', lambda e: PAGEERR.append({'page': url, 'w': width, 'text': str(e)[:300]}))
    ok = True
    try:
        await page.goto(BASE + url, wait_until='load', timeout=60000)
        await page.wait_for_timeout(1200)
        h = await page.evaluate('document.documentElement.scrollHeight')
        y = 0
        while y < h:
            y += 700
            await page.evaluate(f'window.scrollTo(0,{y})')
            await page.wait_for_timeout(150)
            h = await page.evaluate('document.documentElement.scrollHeight')
        await page.wait_for_timeout(2500)
        for fr in page.frames:
            try:
                t = await fr.evaluate('document.body ? document.body.innerText : ""')
            except Exception:
                continue
            for m in VISRX.finditer(t or ''):
                VIS.append({'page': url, 'w': width, 'frame': fr.url.replace(BASE, ''), 'hit': m.group(0),
                            'ctx': t[max(0, m.start() - 80):m.end() + 80].replace('\n', ' ')})
    except Exception as ex:
        ok = False
        PAGEERR.append({'page': url, 'w': width, 'text': 'NAV: ' + str(ex)[:200]})
    VISITED.append({'url': url, 'w': width, 'ok': ok})
    await ctx.close()


async def worker(pw, q, i):
    b = await pw.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'])
    while True:
        try:
            url, w = q.get_nowait()
        except asyncio.QueueEmpty:
            break
        await visit(b, url, w)
        n = len(VISITED)
        if n % 20 == 0:
            print('visited', n, flush=True)
    await b.close()


async def main():
    q = asyncio.Queue()
    targets = (showcase_pages() if '--no-showcase' not in sys.argv else []) + (demo_pages() if DIRECT else [])
    for u in targets:
        for w in (1280, 390):
            q.put_nowait((u, w))
    print('targets', q.qsize(), flush=True)
    async with async_playwright() as pw:
        await asyncio.gather(*(worker(pw, q, i) for i in range(2)))
    paths = {}
    for p, c in LOG:
        paths.setdefault(p, set()).add(c)
    json.dump({'base': BASE, 'visited': VISITED,
               'requests': {p: sorted(map(str, c)) for p, c in sorted(paths.items())},
               'visible': VIS, 'external': EXT, 'failed': FAILED, 'console': CONSOLE, 'pageerror': PAGEERR},
              open(OUT, 'w'), indent=1)
    bad = {p: c for p, c in paths.items() if any(str(x) not in ('200', '304') for x in c)}
    print('requests', len(paths), 'non-200', len(bad), 'external', len(EXT), 'failed', len(FAILED),
          'pageerrors', len(PAGEERR), 'visible-hits', len(VIS), flush=True)


asyncio.run(main())
srv.shutdown()
