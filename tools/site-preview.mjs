// Showcase prototype of the Game DNA site (node tools/build-site.mjs --preview): writes only site/preview/.
//
//   site/preview/index.html                    home for first-time visitors: pitch + looping hero, what you get, gallery,
//                                              combine (kits -> one prompt), how it works
//   site/preview/dna/<id>/index.html           showcase page of every element (demo framed and trimmed, moments, prompt,
//                                              works well with, link to its build records)
//   site/preview/basket/, styles/, about/      showcase basket (one prompt + zip), art styles, about & credits
//   site/preview/internal/index.html           build records for every element (critic, cold tests, versions, issues)
//   site/preview/internal/dna/<id>/index.html  one element's full records (status, parameters, interfaces, spec, API)
//
// The showcase pages carry no scores, cold tests, judge results or version rows; those live only under internal/, reached
// from the footer and from each element page's last link. Hand-written CSS/JS: tools/showcase/ (copied to preview/assets/).
// Uses only existing images (site/assets/hero, frames, moments) and the element demos; nothing new is generated.
import fs from 'node:fs';
import path from 'node:path';

// showcase-only category merge: family letter -> the family it is shown under (colour, chips, breadcrumbs)
const MERGE_SMALL_FAMILIES = true;   // false = show every family as it is (the merge may be dropped once new elements land)
const SHOWCASE_FAMILY = MERGE_SMALL_FAMILIES ? { K: 'N', D: 'L' } : {};   // 2.5D -> 3D, characters & portraits -> generated art; audio & rhythm has its own category since M16 (5 elements)
const SHOWCASE_FAMILY_NAME = MERGE_SMALL_FAMILIES ? { N: '3D & 2.5D' } : {};
const CHOSEN = 'damage-pop';   // the worked example on the home page and the target of every "Play a demo" button
// hero loops, in turn (site/assets/hero/<id>.webp); the chosen element first
const HERO_IDS = ['damage-pop', 'card-battle', 'grapple-swing', 'kart-racer-3d', 'tower-defense', 'billboard-sprites-3d', 'modern-particles', 'tactics-grid-3d', 'loot-beams', 'horde-survival', 'bullet-patterns', 'physics-debris'];
// gallery "Featured" filter (the default view) and the two marquee rows
const FEATURED = ['damage-pop', 'card-battle', 'grapple-swing', 'kart-racer-3d', 'tower-defense', 'billboard-sprites-3d', 'tactics-grid-3d', 'modern-particles', 'loot-beams', 'horde-survival', 'bullet-patterns', 'dynamic-lights',
  'bloom-glow', 'weather-particles', 'verlet-cloth', 'physics-debris', 'water-surface', 'ribbon-trails', 'timing-bar', 'dialogue-box', 'grid-range-path', 'battle-transition', 'wfc-town-3d', 'match3-battle'];
const KITS = ['modern-lighting-kit', 'roguelite-run-kit', 'party-battle-kit', 'tactics-map-kit'];
// per showcase element: small tested baskets shown under "Works well with" (each is a --verify case or a cold-tested pairing)
const TRY_WITH = {
  'damage-pop': [
    { name: 'Juicy hits', line: 'Numbers plus glow and squash on every blow.', ids: ['bloom-glow', 'damage-pop', 'squash-stretch'] },
    { name: 'Card battle', line: 'Start from the card-battle game and add the numbers.', ids: ['card-battle', 'damage-pop'], starter: true },
    { name: 'Horde survival', line: 'Start from the survivor game; every auto-hit pops.', ids: ['horde-survival', 'damage-pop'], starter: true }
  ]
};
// one plain sentence under the demo (written for the showcase from element.json's oneLiner)
const WHAT = { 'damage-pop': 'Each hit arcs out of the target and lands, crits pop with a burst and a short shake, rapid hits roll into one punching total, and every damage type gets its own colour and icon, without ever covering a unit or the HUD.' };
// Framed demos in showcase mode (showcase.js trims them on load, same origin; the demo pages themselves are not changed):
//   every demo: its own top header (code, title, long description) is hidden, any element code left in its text
//   (C-11, (E-01), ...) is removed and elements with class "code" are hidden; the frame grows to the demo's full content
//   height, so there is no scroll area inside the page. DEMO_EMBED adds per-demo selectors to hide (internal notes,
//   comparison strips, URL tips) so the controls sit right under the game on phones.
const DEMO_EMBED_DEFAULT = ['body > header'];
const DEMO_EMBED = { 'damage-pop': ['.cmp', 'aside .foot', '#stage .caption'] };
const embedAttr = id => ` data-embed="${[...DEMO_EMBED_DEFAULT, ...(DEMO_EMBED[id] || [])].join(', ').replace(/"/g, '&quot;')}"`;
const DEMO_TIPS = { 'damage-pop': 'Fire hits with the buttons (or keys 1–8). The scripted fight runs until you switch it off.',
  'chip-music': 'Browsers keep sound off until you ask: press Turn sound on, then watch the piano roll follow the scene.',
  'beat-judge': 'Press Turn sound on to hear the beat, then tap Z, Space or the arena on the beat.',
  'adaptive-music': 'Press Turn sound on to hear the layers change as the scene fights, heals and meets the boss.' };
// audio demos: the selector of the demo's own sound switch (in its header, which the frame hides); the page shows a button
const DEMO_SOUND = { 'chip-music': '#soundState', 'beat-judge': '#soundState', 'adaptive-music': '#sound' };
// Share cards (Open Graph + Twitter): absolute URLs from SITE_ORIGIN (env GAME_DNA_ORIGIN overrides); the showcase is
// served under /site/preview/ there (tools/showcase-deploy/). Images: tools/showcase/og/<id>.jpg and home.jpg (1200x630,
// made by tools/showcase/launch_media.py og), copied to site/preview/og/; pages without their own card use home.jpg.
const SITE_ORIGIN = (process.env.GAME_DNA_ORIGIN || 'https://game-dna.pages.dev').replace(/\/+$/, '');
const SITE_BASE = SITE_ORIGIN + '/site/preview/';
const OG_W = 1200, OG_H = 630;
// SEO / GEO: <link rel="canonical"> and JSON-LD always name the PUBLIC site, also in the unlisted preview build
// (env GAME_DNA_CANONICAL_ORIGIN overrides; tools/showcase-deploy/build-staging.py --canonical-origin rewrites the staged
// copy). catalog-src.json (relative paths, public fields only) is what the --public staging build turns into /catalog.json
// and /llms-full.txt; it is not shipped itself.
const CANON_ORIGIN = (process.env.GAME_DNA_CANONICAL_ORIGIN || 'https://game-dna.pages.dev').replace(/\/+$/, '');
const CANON_BASE = CANON_ORIGIN + '/site/preview/';
const REPO_URL = 'https://github.com/lucemia/game-dna';
const LICENSE_URL = 'https://opensource.org/licenses/MIT';
const AUTHOR = { '@type': 'Person', name: 'David Chen', url: 'https://github.com/lucemia' };
const HOME_TITLE = 'Game DNA – Drop-in game elements for AI coding agents';
const HOME_DESC = 'Add game feel to your browser game: every element is a playable demo, a small JS module and a prompt your AI coding agent follows to wire it into your code.';
const BLOG_PUBLISHED = '2026-11-24', BLOG_MODIFIED = '2026-11-24';   // the post went live with the site on 2026-11-24
const ldJson = o => JSON.stringify(o).replace(/</g, '\\u003c');
const DEMO_TIP_DEFAULT = { addon: 'Play with it: the controls sit beside or under the game.', system: 'A complete little game: play it, the controls sit beside or under it.' };

// ✦ AI art (the user, 2026-11-20): every element whose showcase demo shows AI-generated pictures, derived from the
// repo, not listed by hand. Art roots = the folder of every assets.json that records `generated` (L-series packs,
// demo-kit, bark-bubbles demo cast, painted-impasto skin) plus that element's starter/art/; AI_ART_DERIVED = bundles
// built from those pictures. A demo counts when its index.html, or a non-module script it loads, points into a root
// (a file path or a base folder such as '../assets/'). Returns { id: [roots it uses] }.
const AI_ART_DERIVED = ['demo-kit/kit-art.js', 'elements/match3-battle/starter/art/', 'elements/horde-survival/starter/art/'];
function aiArtDemos(ROOT, ids) {
  const rel = p => path.relative(ROOT, p).split(path.sep).join('/');
  const roots = new Set(AI_ART_DERIVED), manifests = [];
  const walk = (d, depth) => {
    if (depth > 4 || !fs.existsSync(d)) return;
    for (const n of fs.readdirSync(d, { withFileTypes: true })) {
      if (n.isDirectory() && !/^(checks|shots|gen|node_modules|\.git)$/.test(n.name)) walk(path.join(d, n.name), depth + 1);
      else if (n.name === 'assets.json') manifests.push(path.join(d, n.name));
    }
  };
  for (const top of ['elements', 'skins', 'demo-kit']) walk(path.join(ROOT, top), 0);
  for (const m of manifests) {
    let j; try { j = JSON.parse(fs.readFileSync(m, 'utf8')); } catch { continue; }
    if (!j.generated) continue;
    const dir = path.dirname(m); roots.add(rel(dir) + '/');
    const art = path.join(dir, '..', 'starter', 'art'); if (fs.existsSync(art)) roots.add(rel(art) + '/');
  }
  const LIT = /["'`]((?:\.{1,2}\/|[A-Za-z0-9_@-])[A-Za-z0-9_@.\-\/]*\.(?:js|png|webp|jpe?g|json))(?:[?#][^"'`]*)?["'`]/g;
  const DIRLIT = /["'`](\.{1,2}\/[A-Za-z0-9_@.\-\/]*\/)["'`]/g;
  const SRC = /<script[^>]+src="([^"]+)"/g;
  const hit = p => { const r = rel(p); for (const x of roots) if (x.endsWith('/') ? r.startsWith(x) : r === x) return x; return null; };
  const out = {};
  for (const id of ids) {
    const demoDir = path.join(ROOT, 'elements', id, 'demo'), f = path.join(demoDir, 'index.html');
    if (!fs.existsSync(f)) continue;
    const seen = new Set(), found = new Set();
    const scan = (file, bases) => {
      if (seen.has(file)) return; seen.add(file);
      const s = fs.readFileSync(file, 'utf8').slice(0, 400000);
      for (const m of s.matchAll(DIRLIT)) for (const b of bases) {
        const r = rel(path.resolve(b, m[1])) + '/', h = [...roots].find(x => x.endsWith('/') && r.startsWith(x));
        if (h) { found.add(h); break; }
      }
      const refs = [...s.matchAll(LIT)].map(m => m[1]).concat([...s.matchAll(SRC)].map(m => m[1]));
      for (const u of refs) for (const b of bases) {
        const t = path.resolve(b, u.split(/[?#]/)[0]);
        if (!fs.existsSync(t)) continue;
        const h = hit(t);
        if (h) found.add(h);
        else if (t.endsWith('.js') && rel(t).startsWith('elements/') && !rel(t).includes('/module/')) scan(t, [...new Set([path.dirname(t), demoDir, path.dirname(demoDir)])]);
        break;
      }
    };
    scan(f, [demoDir, path.dirname(demoDir)]);
    if (found.size) out[id] = [...found].sort();
  }
  return out;
}

export function buildPreview(X) {
  const { ROOT, SITE, E, BY, COMBOS, FAMILIES, PITCH, HERO_LOOPS, MOMENTS, defaultPrompt, Core, BASKET_DATA, esc, md2html, mdSection, criticLine, lastCritic, hasIssue, MODEL, PERF3D, TIME, COORDS, COORD_LABEL, LAYER, RELEASE_DATE, LOGO, ICON, helixStatic, stripAttrs, firstClause, S } = X;
  const OUT = path.join(SITE, 'preview');
  // showcase categories: families with one or two elements fold into a neighbour (the user, 2026-11-20); the element
  // keeps its family everywhere else (element.json, catalog.json, codes, internal pages). Every category needs >= 5.
  for (const e of E) e.sfam = SHOWCASE_FAMILY[e.fam] || e.fam;
  const SFAM_NAME = Object.fromEntries(Object.entries(FAMILIES).filter(([k]) => !SHOWCASE_FAMILY[k]).map(([k, f]) => [k, SHOWCASE_FAMILY_NAME[k] || f.name]));
  const sfamCount = {}; for (const e of E) sfamCount[e.sfam] = (sfamCount[e.sfam] || 0) + 1;
  const small = Object.entries(sfamCount).filter(([, n]) => n < 5);
  if (small.length && MERGE_SMALL_FAMILIES) throw new Error('showcase category below 5 elements: ' + small.map(([k, n]) => `${SFAM_NAME[k]} (${n})`).join(', ') + ' (edit SHOWCASE_FAMILY in tools/site-preview.mjs)');
  console.log('showcase categories: ' + Object.entries(sfamCount).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${SFAM_NAME[k]} ${n}`).join(', '));
  fs.rmSync(OUT, { recursive: true, force: true });
  const write = (rel, s) => { if (rel.startsWith('internal/')) return;   // public repo: no internal build-record pages
    const p = path.join(OUT, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };
  for (const f of ['showcase.css', 'showcase.js']) write('assets/' + f, fs.readFileSync(path.join(ROOT, 'tools', 'showcase', f), 'utf8'));
  // self-hosted fonts (Inter, JetBrains Mono; SIL OFL 1.1, licence texts beside them): tools/showcase/fonts.css + fonts/
  write('assets/fonts.css', fs.readFileSync(path.join(ROOT, 'tools', 'showcase', 'fonts.css'), 'utf8'));
  for (const f of fs.readdirSync(path.join(ROOT, 'tools', 'showcase', 'fonts'))) { fs.mkdirSync(path.join(OUT, 'assets', 'fonts'), { recursive: true }); fs.copyFileSync(path.join(ROOT, 'tools', 'showcase', 'fonts', f), path.join(OUT, 'assets', 'fonts', f)); }
  // promo video (web re-encode of launch-media/video/game-dna-promo-16x9-en-v2.mp4): tools/showcase/media/ -> preview/media/
  for (const f of fs.readdirSync(path.join(ROOT, 'tools', 'showcase', 'media'))) { fs.mkdirSync(path.join(OUT, 'media'), { recursive: true }); fs.copyFileSync(path.join(ROOT, 'tools', 'showcase', 'media', f), path.join(OUT, 'media', f)); }
  const OG_SRC = path.join(ROOT, 'tools', 'showcase', 'og');
  const OG_IMG = new Set(fs.existsSync(OG_SRC) ? fs.readdirSync(OG_SRC).filter(f => f.endsWith('.jpg')).map(f => f.slice(0, -4)) : []);
  for (const f of OG_IMG) { fs.mkdirSync(path.join(OUT, 'og'), { recursive: true }); fs.copyFileSync(path.join(OG_SRC, f + '.jpg'), path.join(OUT, 'og', f + '.jpg')); }
  console.log(`showcase share cards: ${OG_IMG.size} images (${[...OG_IMG].filter(x => x !== 'home' && !x.startsWith('blog-')).length} elements, home, ${[...OG_IMG].filter(x => x.startsWith('blog-')).length} blog), origin ${SITE_ORIGIN}`);
  const ogFile = ogId => 'og/' + (OG_IMG.has(ogId) ? ogId : 'home') + '.jpg';
  const canonImg = ogId => CANON_BASE + ogFile(ogId);   // the share card on the public origin (JSON-LD image)
  const WEBSITE_REF = { '@type': 'WebSite', '@id': CANON_BASE + '#website', name: 'Game DNA', url: CANON_BASE };
  const shareMeta = (rel, title, desc, ogId, ogType = 'website') => {
    const img = SITE_BASE + ogFile(ogId), url = SITE_BASE + rel;
    return [['property', 'og:type', ogType], ['property', 'og:site_name', 'Game DNA'], ['property', 'og:title', title], ['property', 'og:description', desc],
      ['property', 'og:url', url], ['property', 'og:image', img], ['property', 'og:image:width', OG_W], ['property', 'og:image:height', OG_H],
      ['property', 'og:image:alt', title], ['name', 'twitter:card', 'summary_large_image'], ['name', 'twitter:title', title],
      ['name', 'twitter:description', desc], ['name', 'twitter:image', img]]
      .map(([k, n, v]) => `<meta ${k}="${n}" content="${esc(String(v))}">`).join('\n') + '\n';
  };
  const cap1 = t => t.charAt(0).toUpperCase() + t.slice(1);
  const CODE_RE = /\s*\((?:[^()]*\b[A-N]-\d{2}\b[^()]*)\)/g;   // "(E-01)" style asides are dropped from showcase text
  const pitch = e => cap1(PITCH[e.id] || firstClause(e.json.oneLiner.replace(CODE_RE, ''))).replace(/\.$/, '') + '.';
  // one plain sentence on what the element does: WHAT, else the oneLiner's first sentence without codes, shortened at a
  // clause boundary when it runs long
  const whatOf = e => { if (WHAT[e.id]) return WHAT[e.id];
    let t = say(e.json.oneLiner).replace(CODE_RE, '');
    t = (t.match(/^.*?[.!?](?=\s|$)/) || [t])[0].trim();
    if (t.length > 230) { const cut = t.slice(0, 230).search(/[;:](?=[^;:]*$)/); t = (cut > 90 ? t.slice(0, cut) : t.slice(0, t.lastIndexOf(',', 230) > 90 ? t.lastIndexOf(',', 230) : 230)).replace(/[,;:\s]+$/, '') + '.'; }
    return cap1(t); };
  const kindWord = e => e.kind === 'system' ? 'Starter game' : 'Add-on';
  const depthOf = rel => rel.split('/').filter(Boolean).length;
  // P = path from the page to site/preview/; every link stays inside the showcase
  const elHref = (id, P) => `${P}dna/${id}/`;
  const ARROW = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3 8h10m-4-4 4 4-4 4"/></svg>';

  function shell({ rel, title, desc, body, internal = false, head = '', scripts = [], og = 'home', ogType = 'website', jsonld = null }) {
    const P = depthOf(rel) ? '../'.repeat(depthOf(rel)) : './';
    return `<!doctype html>
<html lang="en" data-theme="dark" class="sc${internal ? ' sc-internal' : ''}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
${internal ? '<meta name="robots" content="noindex">\n' : `<link rel="canonical" href="${esc(CANON_BASE + rel)}">\n` + shareMeta(rel, title, desc, og, ogType)}${!internal && jsonld ? `<script type="application/ld+json">${ldJson({ '@context': 'https://schema.org', '@graph': [].concat(jsonld) })}</script>\n` : ''}<link rel="stylesheet" href="${P}assets/fonts.css">
<link rel="stylesheet" href="${P}../assets/families.css">
<link rel="stylesheet" href="${P}assets/showcase.css">
${head}</head>
<body>
<a class="sc-skip" href="#main">Skip to content</a>
<header class="sc-top"><div class="sc-wrap">
<a class="sc-brand" href="${P}">${LOGO}<span>Game DNA</span></a>
<nav class="sc-nav" aria-label="Main">${internal ? `<a href="${P}internal/">Build records</a><a href="${P}">Showcase</a>` : `<a href="${P}#gallery">Elements</a><a href="${P}styles/">Styles</a><a href="${P}#how">How it works</a><a href="${P}start/">Start</a><a class="sc-bk-link" href="${P}basket/">Basket<b data-bk-count hidden></b></a>`}</nav>
${internal ? '' : `<a class="sc-btn sc-btn-hot sm sc-top-cta" href="${P}dna/${CHOSEN}/">${ICON.play}<span>Play a demo</span></a>`}
</div></header>
<main id="main">
${body}
</main>
<footer class="sc-foot"><div class="sc-wrap">
<div class="sc-foot-brand">${LOGO}<span>Game DNA</span></div>
<p>Playable game elements for games you make with an AI coding agent. Original art only; not affiliated with any game company.</p>
<nav class="sc-foot-links" aria-label="More"><a href="${P}#gallery">All elements</a><a href="${P}basket/">Basket</a><a href="${P}styles/">Art styles</a><a href="${P}start/">Start in 5 minutes</a><a href="${P}tests/">How we test</a><a href="${P}blog/how-game-dna-works/">How Game DNA works (blog)</a><a href="${P}about/">About &amp; credits</a></nav>
</div></footer>
${scripts.map(x => `<script src="${x.replace('@', P)}"></script>`).join('\n')}${scripts.length ? '\n' : ''}<script src="${P}assets/showcase.js"></script>
</body>
</html>
`;
  }

  // ---------- shared pieces
  const thumb = (e, P, extra = '') => `<div class="sc-thumb${e.hd ? ' hd' : ' px'}" ${stripAttrs(e, P + '../')}${extra}><div class="frame"></div></div>`;
  const AI_DEMO = aiArtDemos(ROOT, E.map(e => e.id));
  const aiArt = e => !!(e.pack || AI_DEMO[e.id]);
  console.log(`showcase ✦ AI art: ${E.filter(aiArt).length} elements (${E.filter(e => e.pack).length} with a sample pack)`);
  const genMark = e => aiArt(e) ? `<span class="sc-gen" title="${e.pack ? 'Uses AI-generated art (a sample pack is included)' : 'The demo shows pictures made with an AI image generator'}">✦ AI art</span>` : '';
  function card(e, P) {
    const feat = FEATURED.indexOf(e.id);
    return `<a class="sc-card rv" href="${elHref(e.id, P)}" data-fam="${e.sfam}" data-cat="${e.sfam}"${feat >= 0 ? ` data-feat="${feat}"` : ''}>
${thumb(e, P)}
<span class="sc-card-body"><span class="sc-card-name">${esc(e.name)}</span><span class="sc-card-line">${esc(pitch(e))}</span><span class="sc-card-meta"><span class="sc-dot"></span>${kindWord(e)}${genMark(e)}</span></span>
</a>`;
  }
  // the combine engine lower-cases names in the prompt heading; the showcase shows them as named (lines 1-6 only)
  const properNames = (md, ids) => md.split('\n').map((l, i) => i < 6 ? ids.reduce((s, id) => s.split(BY[id].name.toLowerCase()).join(BY[id].name), l) : l).join('\n');
  const prompt = (ids, starter) => { const r = Core.run(BASKET_DATA, { ids, starter: !!starter }); return { md: r.written ? properNames(r.md, ids) : '', res: r }; };
  const basketHash = (ids, starter) => 'e=' + ids.join(',') + (starter ? '&starter=1' : '');
  const lines = s => s.split('\n').length;
  // the showcase shows the opening of a prompt only, up to the first line written for the agent's own checks (URL switches,
  // checksums, review words); Copy and "the whole prompt" give the full file
  const DEVTXT = /\?t=|[?&](freeze|auto|log|scene|script)=|freeze=1|uiRects|\bprobe\b|\bjudge\b|\bcritic\b|cold[- ]test|sha256|\bv\d+\.\d+(\.\d+)?\b|module v\d|playcheck|window\.__/i;
  const opening = (md, max) => { const out = []; for (const l of String(md).split('\n')) { if (DEVTXT.test(l) || out.length >= max) break; out.push(l); } while (out.length && !out[out.length - 1].trim()) out.pop(); return out.join('\n'); };
  // showcase prompts name elements instead of their codes ("I-08" -> "WebGL post-process pipeline"); otherwise the same
  // text combine.mjs writes. Also used on every text taken from element data (pitches, moments, kit blurbs, styles).
  const CODE_NAME = Object.fromEntries(E.map(e => [e.code, e.name]));
  // a code next to the name it stands for ("F-03 chip music", "chip music (F-03)") becomes the name once, not twice
  const reEsc = x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const plain = t => String(t || '').replace(/\b([A-N]-\d{2})\b( ?)/g, (m, c, sp, off, all) => {
    const n = CODE_NAME[c]; if (!n) return m;
    const after = all.slice(off + m.length), before = all.slice(0, off);
    if (sp && new RegExp('^' + reEsc(n) + '\\b', 'i').test(after)) return '';   // "F-03 chip music" -> "chip music"
    if (new RegExp(reEsc(n) + '\\s*\\(\\s*$', 'i').test(before)) return '\u0000' + sp;   // "chip music (F-03)" -> "chip music"
    return n + sp; }).replace(/\s*\(\u0000 ?\)/g, '');
  // visitor-facing copy taken from specs (moments, what it does, genres): also no API names
  const say = t => plain(t).replace(/\buiRects\b/g, 'its HUD areas').replace(/\?t=\S*/g, '').replace(/\s{2,}/g, ' ');
  // the one-liner in public wording (JSON-LD description, catalog) and its first sentence, at most 160 characters (meta
  // description, llms-full.txt)
  const oneLine = e => pub(e.json.oneLiner).replace(CODE_RE, '').replace(/\s{2,}/g, ' ').trim();
  const metaDesc = e => { const o = oneLine(e); let t = (o.match(/^.*?[.!?](?=\s|$)/) || [o])[0].trim();
    const bal = x => (x.match(/\(/g) || []).length === (x.match(/\)/g) || []).length && !/["“][^"”]*$/.test(x.replace(/"[^"]*"/g, ''));
    if (t.length > 160) { let c = -1; for (let i = 158; i > 80; i--) if (/[,;:—–]/.test(t[i]) && bal(t.slice(0, i))) { c = i; break; }   // at a clause boundary, else a word
      t = c > 80 ? t.slice(0, c).trim() + '.' : t.slice(0, t.lastIndexOf(' ', 157)).replace(/[,;:(\s]+$/, '').replace(/\s+(and|or|a|an|the|of|to|in|with|for|on)$/i, '') + '…'; }
    return cap1(t); };
  const CATALOG = [];
  // public test records (tests/ page and the "Tested" line on element pages): the same data as the internal records
  // (critic verdicts from checks/, cold-test rows from build-site.mjs STATUS / coldtests verdicts), in public wording
  const runsOf = e => { let p = 0, n = 0; for (const [, r] of e.status.cold) { const m = String(r).match(/^(\d+)\/(\d+)/); if (m) { p += +m[1]; n += +m[2]; } } return { p, n }; };
  const reviewOf = e => { const c = lastCritic(e); return c ? { score: c.starter != null ? `${c.demo} / ${c.starter}` : String(c.demo), pass: !!c.pass, rounds: e.critic.length } : null; };
  const pub = t => say(t)
    .replace(/\b(?:the )?repo judge\b/gi, 'our test reviewer').replace(/\bjudge's\b/gi, "reviewer's").replace(/\bjudges?\b/gi, 'reviewer')
    .replace(/\bcritics?\b/gi, 'review').replace(/\bcold[- ]?tests?(ed)?\b/gi, 'blind run').replace(/\b(?:the )?sol[- ]high rerun\b/gi, 'the final rerun')
    .replace(/,?\s*\bsol[- ](?:high|low)\b/gi, '').replace(/\bCodex\b/g, 'the coding agent').replace(/\bgpt-[\w.-]+/gi, 'a model')
    .replace(/\bimage_gen\b/g, 'image generator').replace(/\bour test host\b/gi, 'our test game').replace(/\bhosts\b/g, 'games').replace(/\bhost\b/g, 'game')
    .replace(/\bwave-4 sanity check\b/gi, 'final check').replace(/\bsanity (re)?runs?\b/gi, 'check reruns').replace(/\s{2,}/g, ' ').trim();

  // =====================================================================================================================
  // home
  {
    const P = './';
    const chosen = BY[CHOSEN];
    const hero = HERO_IDS.filter(id => BY[id] && HERO_LOOPS[id]).map(id => { const e = BY[id]; return { id, name: e.name, line: pitch(e), fam: e.sfam, n: HERO_LOOPS[id].n, step: HERO_LOOPS[id].step, href: elHref(id, P), play: true }; });
    const h0 = hero[0];
    const marq = (ids, dir) => `<div class="sc-marquee${dir ? ' rev' : ''}"><div class="sc-marquee-track">${[...ids, ...ids].map((id, i) => { const e = BY[id]; return `<a class="sc-tile" href="${elHref(id, P)}" data-fam="${e.sfam}"${i >= ids.length ? ' aria-hidden="true" tabindex="-1"' : ''}>${thumb(e, P)}<span class="sc-tile-cap">${esc(e.name)}</span></a>`; }).join('')}</div></div>`;
    const featured = FEATURED.filter(id => BY[id]);
    const rowA = featured.filter((_, i) => i % 2 === 0), rowB = featured.filter((_, i) => i % 2 === 1);
    const cats = Object.entries(SFAM_NAME).filter(([k]) => E.some(e => e.sfam === k)).map(([k, name]) => [k, { name }]);
    const chips = `<div class="sc-chips" role="toolbar" aria-label="Filter elements"><button type="button" class="sc-chip" data-filter="feat" aria-pressed="true">Featured</button><button type="button" class="sc-chip" data-filter="all" aria-pressed="false">All ${E.length}</button>` +
      cats.map(([k, f]) => `<button type="button" class="sc-chip" data-filter="${k}" data-fam="${k}" aria-pressed="false"><i></i>${esc(f.name)}</button>`).join('') + '</div>';
    // what you get: the chosen element as the worked example
    const cp = plain(defaultPrompt[chosen.id] || '');
    const typed = opening(cp, 40).split('\n').filter(l => l.trim()).slice(0, 9).join('\n');
    const modBytes = chosen.mod.file && fs.existsSync(path.join(chosen.dir, chosen.mod.file)) ? fs.statSync(path.join(chosen.dir, chosen.mod.file)).size : 0;
    const modName = path.basename(chosen.mod.file || 'module.js');
    const get = `<div class="sc-get">
<article class="sc-get-card rv"><div class="sc-get-vis">${thumb(chosen, P, ' data-auto')}<a class="sc-get-play" href="${elHref(chosen.id, P)}">${ICON.play}Play it</a></div><span class="sc-step-no">01</span><h3>A demo you can play</h3><p>Every element runs on its own page. Press the buttons, change the settings, see how it feels before you take it.</p></article>
<article class="sc-get-card rv"><div class="sc-get-vis sc-term"><div class="sc-term-bar"><i></i><i></i><i></i><span>prompt.md</span></div><pre class="sc-typing" data-type="${esc(typed)}" aria-label="The first lines of a Game DNA prompt">${esc(typed)}</pre></div><span class="sc-step-no">02</span><h3>A prompt to copy</h3><p>Plain English, written for a game your agent has never seen. Paste it into Claude Code, Codex, Cursor or any coding agent.</p></article>
<article class="sc-get-card rv"><div class="sc-get-vis sc-files"><div class="sc-file" data-fam="${chosen.sfam}"><span class="sc-file-ic">JS</span><span><b>${esc(modName)}</b><small>${Math.round(modBytes / 1024)} KB · one file · no dependencies</small></span></div><div class="sc-file"><span class="sc-file-ic md">MD</span><span><b>README.md</b><small>the API, for your agent to read</small></span></div><pre class="sc-code"><span class="k">const</span> pops = ${esc(chosen.mod.global || 'GameDNA')}.create({ getAnchor });
pops.spawn(<span class="s">'imp'</span>, <span class="n">47</span>, <span class="s">'crit'</span>);</pre></div><span class="sc-step-no">03</span><h3>A module your agent wires in</h3><p>The hard part is already written and tested. Your agent connects it to your game's own events, so your code stays yours.</p></article>
</div>`;
    // combine: recommended kits -> one combined prompt
    const kits = KITS.map(s => COMBOS.find(c => c.slug === s)).filter(Boolean).map(c => {
      const sys = c.ids.map(id => BY[id]).find(e => e.kind === 'system'), starter = !!(c.starter && sys);
      const pr = prompt(c.ids, starter);
      write(`combos/${c.slug}.md`, plain(pr.md));
      return { ...c, starter, md: plain(pr.md) };
    });
    const kitTabs = `<div class="sc-tabs" role="tablist" aria-label="Kits">${kits.map((k, i) => `<button type="button" role="tab" class="sc-tab" id="tab-${k.slug}" aria-controls="kit-${k.slug}" aria-selected="${i ? 'false' : 'true'}">${esc(k.name)}<small>${k.ids.length} elements</small></button>`).join('')}</div>`;
    const kitPanels = kits.map((k, i) => {
      const els = k.ids.map(id => BY[id]);
      const excerpt = opening(k.md, 16);
      return `<div class="sc-kit" role="tabpanel" id="kit-${k.slug}" aria-labelledby="tab-${k.slug}"${i ? ' hidden' : ''}>
<div class="sc-kit-in">
<p class="sc-kit-blurb">${esc(plain(firstClause(k.blurb)) + '.')}</p>
<div class="sc-kit-els">${els.map((e, j) => `${j ? '<span class="sc-plus" aria-hidden="true">+</span>' : ''}<a class="sc-kit-el" href="${elHref(e.id, P)}" data-fam="${e.sfam}" style="--i:${j}">${thumb(e, P, ' data-auto')}<span>${esc(e.name)}</span></a>`).join('')}</div>
</div>
<div class="sc-kit-helix" aria-hidden="true">${helixStatic(els.map(e => e.sfam), 520, 64)}</div>
<div class="sc-kit-out">
<div class="sc-term sc-kit-prompt"><div class="sc-term-bar"><i></i><i></i><i></i><span>COMBO.md · ${lines(k.md)} lines</span></div><pre>${esc(excerpt)}</pre></div>
<div class="sc-kit-side"><p class="sc-big">${els.length} elements → <b>1 prompt</b></p><p class="sc-muted">The basket checks that they fit together, orders them, and writes one prompt plus a zip of the module files${k.starter ? ', starting from a ready-made game' : ''}.</p>
<div class="sc-btns"><a class="sc-btn sc-btn-hot" href="${P}basket/#${basketHash(k.ids, k.starter)}">${ICON.plus}Open in the basket</a><button type="button" class="sc-btn" data-copy-url="combos/${k.slug}.md" data-label="Combined prompt">${ICON.copy}Copy the prompt</button></div></div>
</div>
</div>`;
    }).join('');

    const body = `<section class="sc-hero" data-hero='${esc(JSON.stringify(hero))}' style="--glow:var(--fam-${h0.sfam})">
<div class="sc-aurora" aria-hidden="true"></div>
<div class="sc-wrap sc-hero-grid">
<div class="sc-hero-copy">
<p class="sc-eyebrow">For games you build with an AI coding agent</p>
<h1>Drop game feel into <span class="sc-grad">your own game.</span></h1>
<p class="sc-lede">Game DNA is a library of ${E.length} playable game elements: hit effects, battle systems, lights, menus, 3D scenes. Play one, copy its prompt, and your coding agent adds it to your browser game.</p>
<div class="sc-btns"><a class="sc-btn sc-btn-hot lg" href="${elHref(chosen.id, P)}">${ICON.play}Play a demo</a><a class="sc-btn lg ghost" href="#gallery">See all ${E.length} elements ${ARROW}</a></div>
</div>
<div class="sc-hero-stage">
<div class="sc-screen"><div class="sc-loop on" style="background-image:url('${P}../assets/hero/${h0.id}-poster.webp')"></div><div class="sc-loop"></div><div class="sc-scan" aria-hidden="true"></div></div>
<div class="sc-hero-cap"><span class="sc-hero-dot" data-fam="${h0.sfam}"></span><span class="sc-hero-txt"><a class="sc-hero-name" href="${h0.href}">${esc(h0.name)}</a><span class="sc-hero-line">${esc(h0.line)}</span></span><a class="sc-btn sm" href="${h0.href}">${h0.play ? 'Play' : 'Open'} ${ARROW}</a></div>
<div class="sc-hero-dots">${hero.map((h, i) => `<button type="button" data-fam="${h.sfam}" aria-label="Show ${esc(h.name)}"${i ? '' : ' aria-current="true"'}></button>`).join('')}</div>
</div>
</div>
</section>
<section class="sc-sec sc-tight sc-promo" id="video"><div class="sc-wrap">
<p class="sc-eyebrow">Watch the 30-second tour</p>
<div class="sc-promo-frame"><video controls muted playsinline preload="metadata" poster="${P}media/promo-poster.jpg" aria-label="Game DNA promo video (31 seconds)"><source src="${P}media/promo.mp4" type="video/mp4"><a href="${P}media/promo.mp4">Download the promo video (MP4)</a></video></div>
</div></section>
<section class="sc-wall" aria-label="What Game DNA can make">${marq(rowA, false)}${marq(rowB, true)}</section>
<section class="sc-sec" id="what"><div class="sc-wrap">
<p class="sc-eyebrow">What you get with every element</p>
<h2>See it. Copy it. <span class="sc-grad">Your agent builds it in.</span></h2>
${get}
</div></section>
<section class="sc-sec" id="gallery"><div class="sc-wrap">
<p class="sc-eyebrow">The library</p>
<h2>Pick an element</h2>
<p class="sc-sub">Hover a card to watch it move. <b>Add-ons</b> go into any game; <b>starter games</b> are complete little games built on a system, ready to extend.</p>
${chips}
<div class="sc-grid" id="sc-grid">${E.map(e => card(e, P)).join('\n')}</div>
</div></section>
<section class="sc-sec sc-combine" id="combine"><div class="sc-wrap">
<p class="sc-eyebrow">Combine them</p>
<h2>Many elements, <span class="sc-grad">one prompt.</span></h2>
<p class="sc-sub">Put elements in the basket and it writes one prompt that adds them all in the right order. Start from a kit:</p>
${kitTabs}
${kitPanels}
</div></section>
<section class="sc-sec" id="how"><div class="sc-wrap">
<p class="sc-eyebrow">How it works</p>
<h2>Three steps</h2>
<ol class="sc-how">
<li class="rv"><span class="sc-how-no">1</span><h3>Play and pick</h3><p>Try the demos. Change the settings until it feels right; the prompt follows your values.</p></li>
<li class="rv"><span class="sc-how-no">2</span><h3>Hand it to your agent</h3><p>Copy the prompt and give your agent the module file and its README. For several elements, use the basket.</p></li>
<li class="rv"><span class="sc-how-no">3</span><h3>Play your game</h3><p>The agent wires the element to your game's own events. Each prompt ends with checks it can run, and every prompt has been tried by a fresh agent on a game it had never seen.</p></li>
</ol>
<p class="sc-sub"><a href="${P}start/">Start in 5 minutes</a> · <a href="${P}tests/">How we test</a>: every element's review score and its runs on unseen games, failures included. · <a href="${P}blog/how-game-dna-works/">How Game DNA works</a>: what an element is, how it is tested, and what went wrong on the way.</p>
<div class="sc-cta rv"><div><h3>Start with one</h3><p class="sc-muted">${esc(chosen.name)}: ${esc(pitch(chosen).toLowerCase())}</p></div><a class="sc-btn sc-btn-hot lg" href="${elHref(chosen.id, P)}">${ICON.play}Play the demo</a></div>
</div></section>`;
    const homeLd = [
      { ...WEBSITE_REF, description: HOME_DESC, inLanguage: 'en', publisher: AUTHOR },
      { '@type': 'SoftwareSourceCode', '@id': CANON_BASE + '#code', name: 'Game DNA', description: HOME_DESC, url: CANON_BASE, codeRepository: REPO_URL,
        license: LICENSE_URL, programmingLanguage: 'JavaScript', author: AUTHOR, image: canonImg('home'), isPartOf: { '@id': CANON_BASE + '#website' } },
      { '@type': 'ItemList', '@id': CANON_BASE + '#elements', name: 'Game DNA elements', numberOfItems: E.length,
        itemListElement: E.map((e, i) => ({ '@type': 'ListItem', position: i + 1, url: CANON_BASE + `dna/${e.id}/`, name: e.name })) }
    ];
    write('index.html', shell({ rel: '', title: HOME_TITLE, desc: HOME_DESC, body, jsonld: homeLd }));
  }

  // =====================================================================================================================
  // showcase element pages
  for (const e of E) {
    const id = e.id;
    const rel = `dna/${id}/`, P = '../../', root = '../../../../', elRoot = `${root}elements/${id}/`, J = e.json;
    write(`dna/${id}/prompt.md`, properNames(plain(defaultPrompt[id] || ''), [id, ...e.requires]));   // the copied prompt keeps names as named
    const demo = `${elRoot}demo/index.html`;
    const moments = (MOMENTS[id] || []).map((m, k) => {
      const href = m.query && (m.page || 'demo') === 'demo' ? `${elRoot}demo/index.html?${m.query.replace(/&?freeze=1/, '')}` : null;
      const img = `<img src="${P}../assets/moments/${m.img}" width="${m.w}" height="${m.h}" alt="${esc(plain(m.state))}" loading="lazy"${e.hd || e.pack ? '' : ' class="px"'}>`;
      return `<figure class="sc-moment rv" style="--i:${k}" data-ratio="${(m.w / m.h).toFixed(3)}">${href ? `<a href="${esc(href)}" data-moment title="Play the demo above from this moment">${img}<span class="sc-moment-go">${ICON.play}Play from here</span></a>` : img}<figcaption>${esc(say(m.state).replace(CODE_RE, ''))}</figcaption></figure>`;
    }).join('');
    // tested small baskets: TRY_WITH, else the recommended kits that hold this element
    const kitsOf = COMBOS.filter(c => c.ids.includes(id)).map(c => ({ name: c.name, line: plain(firstClause(c.blurb)) + '.', ids: c.ids, starter: c.starter }));
    const tries = (TRY_WITH[id] || kitsOf).slice(0, 3).filter(t => t.ids.every(x => BY[x])).map(t => {
      const els = t.ids.map(x => BY[x]), sys = els.find(o => o.kind === 'system'), st = !!(t.starter && sys);
      const r = Core.run(BASKET_DATA, { ids: t.ids, starter: st, checkOnly: true });
      if (r.errors) { console.warn(`preview: try-with ${t.ids.join('+')} has ${r.errors} errors; skipped`); return ''; }
      return `<article class="sc-try rv"><div class="sc-try-els">${els.map((o, j) => `${j ? '<span class="sc-plus" aria-hidden="true">+</span>' : ''}<a href="${elHref(o.id, P)}" class="sc-try-el${o.id === id ? ' me' : ''}" data-fam="${o.sfam}">${thumb(o, P, ' data-auto')}<span>${esc(o.name)}</span></a>`).join('')}</div>
<div class="sc-try-txt"><h3>${esc(t.name)}</h3><p>${esc(t.line)}</p><a class="sc-btn sm" href="${P}basket/#${basketHash(t.ids, st)}">${ICON.plus}Open in the basket</a></div></article>`;
    }).join('');
    const pairs = e.goodWith.slice(0, 6).map(g => card(BY[g.id], P)).join('\n');
    const fits = J.fits.map(f => `<span class="sc-fit">${esc(plain(f).replace(CODE_RE, ''))}</span>`).join('');
    const modName = path.basename(e.mod.file || 'module.js');
    const body = `<section class="sc-el-top" data-fam="${e.sfam}" style="--glow:var(--fam-${e.sfam})">
<div class="sc-aurora" aria-hidden="true"></div>
<div class="sc-wrap">
<nav class="sc-crumbs" aria-label="Breadcrumb"><a href="${P}">Game DNA</a><span>/</span><a href="${P}#gallery">${esc(SFAM_NAME[e.sfam])}</a>${aiArt(e) ? '<span class="sc-el-tag" title="Some pictures in this demo were made with an AI image generator (see below the demo)">✦ AI art</span>' : ''}</nav>
<div class="sc-el-head">
<div><h1>${esc(e.name)}</h1><p class="sc-lede">${esc(pitch(e))} ${e.kind === 'system' ? 'A complete starter game you can extend.' : 'An add-on for any game.'}</p></div>
<div class="sc-btns"><button type="button" class="sc-btn sc-btn-hot" data-copy-url="prompt.md" data-label="Prompt">${ICON.copy}Copy prompt</button><button type="button" class="sc-btn" data-sc-add="${id}"${e.requires.length ? ` data-req="${e.requires.join(',')}"` : ''}>${ICON.plus}<span class="lab">Add to basket</span></button></div>
</div>
<div class="sc-demo">
<div class="sc-demo-bar"><span class="sc-live"><i></i>Live demo</span><span class="sc-demo-tip">${esc(DEMO_TIPS[id] || DEMO_TIP_DEFAULT[e.kind])}</span>${DEMO_SOUND[id] ? `<button type="button" class="sc-btn sm sc-sound" data-sound="${DEMO_SOUND[id]}" aria-pressed="false">${ICON.play}<span class="lab">Turn sound on</span></button>` : ''}<button type="button" class="sc-demo-open" data-fullscreen>Full screen ${ARROW}</button></div>
<iframe class="sc-demo-frame"${embedAttr(id)} data-name="${esc(e.name)}" src="${demo}" title="${esc(e.name)}: interactive demo" loading="eager" allow="autoplay; fullscreen"></iframe>
</div>
${aiArt(e) ? `<p class="sc-el-gen" id="ai-art"><b>✦ AI art</b> ${e.pack ? 'This element ships a sample pack of pictures made with an AI image generator; the demo uses them.' : 'Some pictures in this demo (characters, backdrops or UI frames) were made with an AI image generator. The element\'s code draws nothing generated.'} <a href="${P}about/#credits">About the art</a></p>` : ''}
</div>
</section>
<section class="sc-sec sc-tight"><div class="sc-wrap">
<p class="sc-eyebrow">What it does</p>
<p class="sc-what">${esc(whatOf(e))}</p>
<div class="sc-fits"><span class="sc-fits-lab">Made for</span>${fits}</div>
${(() => { const r = runsOf(e), v = reviewOf(e); return r.n || v ? `<p class="sc-muted sc-tested"><a href="${P}tests/#${id}">Tested: ${r.n ? `${r.p}/${r.n} runs on unseen games passed` : 'runs on unseen games pending'}${v ? ` · visual review ${esc(v.score)}${v.pass ? '' : ' (below the bar)'}` : ''}</a></p>` : ''; })()}
</div></section>
${moments ? `<section class="sc-sec" id="moments"><div class="sc-wrap">
<p class="sc-eyebrow">Moments</p>
<h2>${['', 'One moment', 'Two moments', 'Three moments', 'Four moments'][(MOMENTS[id] || []).length] || 'Moments'} from the demo</h2>
<div class="sc-moments">${moments}</div>
</div></section>` : ''}
<section class="sc-sec" id="prompt"><div class="sc-wrap sc-prompt-grid">
<div>
<p class="sc-eyebrow">Take it home</p>
<h2>Hand it to <span class="sc-grad">your agent</span></h2>
<ol class="sc-mini-steps"><li><b>Copy the prompt.</b> It is written for a game your agent has never seen.</li><li><b>Give it the module</b> (<code>${esc(modName)}</code>) and its README.</li><li><b>Play your game.</b> The prompt ends with checks your agent can run.</li></ol>
<div class="sc-btns"><button type="button" class="sc-btn sc-btn-hot lg" data-copy-url="prompt.md" data-label="Prompt">${ICON.copy}Copy prompt</button><a class="sc-btn lg" href="${elRoot}${e.mod.file}" download>${ICON.dl}Module</a>${e.readmeExists ? `<a class="sc-btn lg ghost" href="${elRoot}${e.mod.readme}" download="${id}.README.md">${ICON.dl}README</a>` : ''}</div>
</div>
<div class="sc-term sc-prompt-card"><div class="sc-term-bar"><i></i><i></i><i></i><span>prompt.md · ${lines(plain(defaultPrompt[id] || ''))} lines</span></div><pre tabindex="0">${esc(opening(properNames(plain(defaultPrompt[id] || ''), [id, ...e.requires]), 26))}</pre><a class="sc-fold-btn" href="prompt.md" target="_blank" rel="noopener">Open the whole prompt</a></div>
</div></section>
<section class="sc-sec" id="works-with"><div class="sc-wrap">
<p class="sc-eyebrow">Works well with</p>
<h2>Combine it</h2>
${tries ? `<div class="sc-tries">${tries}</div>` : ''}
${pairs ? `<h3 class="sc-h3">Also pairs well with</h3><div class="sc-grid sc-grid-sm">${pairs}</div>` : ''}
</div></section>
`;
    const category = SFAM_NAME[e.sfam], url = CANON_BASE + rel;
    const elLd = { '@type': 'SoftwareSourceCode', '@id': url + '#element', name: e.name, description: oneLine(e),
      keywords: [...new Set([category, kindWord(e), ...J.fits.map(f => plain(f).replace(CODE_RE, ''))])].join(', '), url,
      image: canonImg(id), isPartOf: WEBSITE_REF, codeRepository: REPO_URL, programmingLanguage: 'JavaScript', license: LICENSE_URL, author: AUTHOR };
    write(`dna/${id}/index.html`, shell({ rel, title: `${e.name} · Game DNA`, desc: metaDesc(e), body, og: id, jsonld: elLd }));
    const modOk = e.mod.file && fs.existsSync(path.join(e.dir, e.mod.file));
    CATALOG.push({ id, name: e.name, description: oneLine(e), line: metaDesc(e), category, kind: e.kind === 'system' ? 'system' : 'add-on', aiArt: aiArt(e),
      paths: { page: `site/preview/${rel}`, prompt: `site/preview/${rel}prompt.md`, module: modOk ? `elements/${id}/${e.mod.file}` : null,
        demo: fs.existsSync(path.join(e.dir, 'demo', 'index.html')) ? `elements/${id}/demo/index.html` : null } });
  }
  // public element catalog source (paths relative to the deploy root; staging adds the origin). No scores, reviews, test
  // runs, versions or notes.
  write('catalog-src.json', JSON.stringify({ name: 'Game DNA', elements: CATALOG }, null, 1) + '\n');

  // =====================================================================================================================
  // basket: pick elements, live fit check, one prompt (names instead of codes) + a zip of the modules. Same engine as the
  // main basket (site/assets/combine-core.js + basket-data.js); state in localStorage and the URL hash (#e=a,b&starter=1).
  {
    const P = '../';
    const EL = Object.fromEntries(E.map(e => [e.id, { n: e.name, f: e.sfam, k: e.kind, c: e.code, req: e.requires.length ? e.requires : undefined }]));
    const pick = E.map(e => `<div class="sc-pick" data-fam="${e.sfam}" data-cat="${e.sfam}" data-id="${e.id}">${thumb(e, P)}<span class="sc-pick-name"><a href="${elHref(e.id, P)}">${esc(e.name)}</a><small>${kindWord(e)}</small></span><button type="button" class="sc-pick-add" data-sc-add="${e.id}" aria-label="Add ${esc(e.name)}">${ICON.plus}</button></div>`).join('');
    const cats = Object.entries(SFAM_NAME).filter(([k]) => E.some(e => e.sfam === k)).map(([k, name]) => [k, { name }]);
    const chips = `<div class="sc-chips" role="toolbar" aria-label="Filter elements"><button type="button" class="sc-chip" data-pfilter="all" aria-pressed="true">All</button>` +
      cats.map(([k, f]) => `<button type="button" class="sc-chip" data-pfilter="${k}" data-fam="${k}" aria-pressed="false"><i></i>${esc(f.name)}</button>`).join('') + '</div>';
    const styleOpts = S.map(st => `<option value="${st.slug}">${esc(st.name)}</option>`).join('');
    const body = `<section class="sc-sec sc-tight sc-bk-top"><div class="sc-wrap">
<p class="sc-eyebrow">Basket</p>
<h1 class="sc-h1-sm">Many elements, one prompt</h1>
<p class="sc-sub">Add elements. The basket checks that they fit together, puts them in the right order and writes one prompt for your agent, plus a zip with every module file.</p>
<div class="sc-bk" id="sc-basket">
<div class="sc-bk-main">
<div class="sc-bk-panel">
<div class="sc-bk-head"><h2>In your basket</h2><button type="button" class="sc-btn sm ghost" id="bk-clear">Clear</button></div>
<div id="bk-tray" class="sc-bk-tray"><p class="sc-muted" id="bk-empty">Nothing yet. Add elements from the list, or start from a kit on the home page.</p></div>
<div class="sc-bk-helix" id="bk-helix" aria-hidden="true"></div>
<p class="sc-bk-check" id="bk-check" role="status"></p>
<label class="sc-bk-opt" id="bk-starter-row" hidden><input type="checkbox" id="bk-starter"> <span>Start from the ready-made <b id="bk-starter-name"></b> game</span></label>
<label class="sc-bk-opt sc-bk-style"><span>Art style</span><select id="bk-style"><option value="">Keep my game's own look</option>${styleOpts}</select></label>
<div class="sc-btns"><button type="button" class="sc-btn sc-btn-hot" id="bk-gen">${ICON.play}Write the prompt</button><button type="button" class="sc-btn" id="bk-copy" disabled>${ICON.copy}Copy</button><button type="button" class="sc-btn" id="bk-zip" disabled>${ICON.dl}Zip</button></div>
</div>
<div class="sc-term sc-bk-out" id="bk-out" hidden><div class="sc-term-bar"><i></i><i></i><i></i><span id="bk-meta">COMBO.md</span></div><pre id="bk-pre" tabindex="0"></pre></div>
</div>
<div class="sc-bk-pickwrap"><h2>Add elements</h2>${chips}<div class="sc-picks" id="bk-picks">${pick}</div></div>
</div>
</div></section>
<script>window.SC_EL = ${JSON.stringify(EL).replace(/</g, '\\u003c')};</script>`;
    write('basket/index.html', shell({ rel: 'basket/', title: 'Basket · Game DNA', desc: 'Combine Game DNA elements into one prompt for your coding agent.', body,
      scripts: ['@../assets/combine-core.js', '@../assets/basket-data.js', '@../assets/zip.js'] }));
  }

  // =====================================================================================================================
  // styles: the art styles every skinned element can take (existing preview images), with a copyable style prompt
  {
    const P = '../';
    const short = t => { t = plain(t).replace(/\*\*/g, '').replace(CODE_RE, ''); const m = t.match(/^.*?[.!?](?=\s|$)/); t = m ? m[0] : t; if (t.length > 170) { const k = t.lastIndexOf(',', 170); t = t.slice(0, k > 80 ? k : 170).replace(/[,;:\s]+$/, '') + '.'; } return cap1(t); };
    for (const st of S) write(`styles/${st.slug}.md`, plain(st.prompt));
    const cards = S.map((st, i) => `<article class="sc-style rv" style="--i:${i % 3}">
<div class="sc-style-vis"><img src="${P}../${st.shotA.replace(/^site\//, '')}" alt="${esc(st.name)}: a tactics scene" loading="lazy"${st.pixel ? ' class="px"' : ''}><img class="b" src="${P}../${st.shot.replace(/^site\//, '')}" alt="" loading="lazy"${st.pixel ? ' class="px b"' : ''}></div>
<div class="sc-style-body"><h3>${esc(st.name)}</h3><p>${esc(short(st.essence))}</p>
<div class="sc-btns"><button type="button" class="sc-btn sm" data-copy-url="${st.slug}.md" data-label="Style prompt">${ICON.copy}Copy style prompt</button><button type="button" class="sc-btn sm ghost" data-sc-style="${st.slug}" data-name="${esc(st.name)}">Use in basket</button></div></div>
</article>`).join('');
    const body = `<section class="sc-sec sc-tight"><div class="sc-wrap">
<p class="sc-eyebrow">Art styles</p>
<h1 class="sc-h1-sm">${S.length} looks, one set of elements</h1>
<p class="sc-sub">Elements that draw their own windows, numbers and ranges can take any of these looks. Hover a style to see a second scene. Copy its style prompt, or set it in the basket and the combined prompt starts with it.</p>
<div class="sc-styles">${cards}</div>
</div></section>`;
    write('styles/index.html', shell({ rel: 'styles/', title: 'Art styles · Game DNA', desc: `${S.length} original art styles for Game DNA elements.`, body }));
  }

  // =====================================================================================================================
  // about & credits (showcase wording; the developer details stay on the internal site)
  {
    const P = '../';
    const body = `<section class="sc-sec sc-tight"><div class="sc-wrap sc-about">
<p class="sc-eyebrow">About</p>
<h1 class="sc-h1-sm">About Game DNA</h1>
<div class="sc-about-grid">
<article><h2>What it is</h2><p>A library of game elements for people who make browser games with an AI coding agent. Each element is a demo you can play, a module file that does the hard part, and a prompt that tells your agent how to connect it to a game it has never seen. Elements combine: the basket turns several into one prompt.</p></article>
<article><h2>How we test the prompts</h2><p>Before an element goes up, a fresh coding agent gets only a game it has never seen, the module and the prompt, and an independent reviewer plays the result. Each element's demo is also reviewed for how it looks and feels.</p></article>
<article id="credits"><h2>Art</h2><p>All art is original. Most of it is drawn in code. Some demo art (painted scenes, portraits, UI frames, card art, some HD sprites and backgrounds) was made with an AI image generator; the game code, the pixel art drawn in code and the prompts are our own. Elements whose demo shows such pictures are marked ✦ AI art. Each picture was made once, checked against resemblance to existing games, characters or brands, and its prompt and generation record are kept with the project. The modules themselves never call a generator.</p></article>
<article><h2>Licences</h2><ul><li>Code (modules, demos, starter games, this site): MIT, see the LICENSE file that ships with the code.</li><li>Style descriptions follow the structure of <a href="https://github.com/lemomo-ai/lemo-opuscar" rel="noopener"><i>lemo-opuscar</i></a> by lemomo-ai, adapted (rewritten for game art styles) under <a href="https://creativecommons.org/licenses/by/4.0/" rel="noopener">CC BY 4.0</a>.</li><li>3D elements use three.js 0.149.0 (MIT), bundled with them.</li><li>Fonts: Inter and JetBrains Mono (SIL Open Font License 1.1), served from this site; no font requests go to third parties.</li></ul></article>
<article><h2>Not affiliated</h2><p>Game DNA is not affiliated with, endorsed by or connected to any game company. Element names are plain descriptions of common game mechanics.</p></article>
</div>
<div class="sc-cta rv"><div><h3>Try one</h3><p class="sc-muted">Every element has a demo you can play right now.</p></div><a class="sc-btn sc-btn-hot lg" href="${P}#gallery">${ICON.play}Browse the elements</a></div>
</div></section>`;
    write('about/index.html', shell({ rel: 'about/', title: 'About · Game DNA', desc: 'What Game DNA is, credits and licences.', body }));
  }

  // =====================================================================================================================
  // tests: how elements are tested, then one row per element (public wording, failures included)
  {
    const P = '../';
    let tp = 0, tn = 0, passed = 0, reviewed = 0;
    const rows = E.map(e => {
      const r = runsOf(e), v = reviewOf(e); tp += r.p; tn += r.n; if (v) { reviewed++; if (v.pass) passed++; }
      const rounds = e.status.cold.map(([w, res]) => { const m = String(res).match(/^(\d+)\/(\d+)/), bad = m && +m[1] < +m[2];
        return `<li${bad ? ' class="sc-bad"' : ''}>${esc(pub(w))}: ${esc(pub(res))}</li>`; }).join('');
      const notes = [e.status.coldNote, ...e.status.issues].filter(Boolean).map(x => `<li>${esc(pub(x))}</li>`).join('');
      return `<tr id="${e.id}"><td><a href="${elHref(e.id, P)}">${esc(e.name)}</a></td><td>${v ? `${esc(v.score)}${v.pass ? '' : ' <span class="sc-bad">below the bar</span>'}<br><small class="sc-muted">${v.rounds} round${v.rounds > 1 ? 's' : ''}</small>` : '—'}</td><td>${r.n ? `<b>${r.p}/${r.n}</b>` : '—'}</td><td>${rounds || notes ? `<details><summary>${e.status.cold.length} round${e.status.cold.length === 1 ? '' : 's'}</summary><ul>${rounds}${notes}</ul></details>` : '<span class="sc-muted">no record yet</span>'}</td></tr>`;
    }).join('');
    const body = `<section class="sc-sec sc-tight"><div class="sc-wrap sc-about">
<p class="sc-eyebrow">How we test</p>
<h1 class="sc-h1-sm">Every element, every run, failures included</h1>
<div class="sc-about-grid">
<article><h2>1. Visual review</h2><p>Each demo is reviewed by a separate agent against commercial indie games, character by character and at 2x zoom. It passes at <b>7.5 out of 10 with no major issue</b> (parts not joined, placeholder art, debug leftovers, unreadable text on phones). Most elements needed several rounds.</p></article>
<article><h2>2. Runs on unseen games</h2><p>A fresh coding agent gets <b>only a game it has never seen, the module and the prompt</b>: no browser, no access to this project. A different agent then plays the result. A run passes when the element works, nothing in the game broke, and the game still plays to the end. When a run fails we fix the prompt or the module and run again; the old result stays below.</p></article>
</div>
<p class="sc-sub" style="margin-top:28px">${E.length} elements · ${passed} of ${reviewed} reviewed demos at or above the bar · <b>${tp}/${tn}</b> runs on unseen games passed, all versions counted. Open a row for each round and what went wrong.</p>
<div class="sc-tbl"><table><thead><tr><th>Element</th><th>Visual review</th><th>Runs passed</th><th>Rounds and failures</th></tr></thead><tbody>${rows}</tbody></table></div>
</div></section>`;
    write('tests/index.html', shell({ rel: 'tests/', title: 'How we test · Game DNA', desc: 'How every Game DNA element is tested: visual review scores and runs by a fresh coding agent on games it never saw, failures included.', body }));
  }

  // =====================================================================================================================
  // start: the five-minute path (pick, copy, paste, check; combine with the basket)
  {
    const P = '../';
    const picks = ['damage-pop', 'hit-sparks', 'dialogue-box', 'battle-transition'].filter(id => BY[id]).map(id => card(BY[id], P)).join('\n');
    const body = `<section class="sc-sec sc-tight"><div class="sc-wrap sc-about">
<p class="sc-eyebrow">Start in 5 minutes</p>
<h1 class="sc-h1-sm">Add your first element</h1>
<p class="sc-sub">You need a browser game (one HTML file is enough) and a coding agent: Claude Code, Codex, Cursor or similar.</p>
<ol class="sc-how">
<li><span class="sc-how-no">1</span><h3>Pick an element</h3><p>Play a few demos and choose one that fits your game. Add-ons go into any game; starter games are complete games to extend. Small add-ons are the easiest first try.</p></li>
<li><span class="sc-how-no">2</span><h3>Copy the prompt</h3><p>On the element's page press <b>Copy prompt</b>, and download the <b>module</b> and its <b>README</b> into your game's folder.</p></li>
<li><span class="sc-how-no">3</span><h3>Paste it to your agent</h3><p>Open your agent in the game's folder and paste the prompt. Add one line about your game, e.g. <i>"My game is index.html; hits happen in attack()."</i></p></li>
</ol>
<div class="sc-about-grid">
<article><h2>4. What to check</h2><ul><li>Play your game: the element shows up where the demo showed it.</li><li>Your game still plays to the end; nothing else changed.</li><li>No errors in the browser console.</li><li>Try a phone-sized window if your game runs on phones.</li><li>Ask your agent to run the checks at the end of the prompt.</li></ul></article>
<article><h2>Several at once</h2><p>Add elements to the <a href="${P}basket/">basket</a>. It checks that they fit together, puts them in order and writes one prompt plus a zip of the module files. You can also start from a ready-made game or pick an <a href="${P}styles/">art style</a>.</p></article>
</div>
<h2 style="margin-top:40px">Good first picks</h2>
<div class="sc-grid sc-grid-sm">${picks}</div>
<p class="sc-sub"><a href="${P}#gallery">All ${E.length} elements</a> · <a href="${P}tests/">How we test them</a></p>
</div></section>`;
    write('start/index.html', shell({ rel: 'start/', title: 'Start in 5 minutes · Game DNA', desc: 'Pick a Game DNA element, copy its prompt, paste it to your coding agent with your game, then check the result.', body }));
  }

  // =====================================================================================================================
  // blog: the method post (source tools/showcase/blog/<slug>.md; links written as @/<path> resolve to this showcase)
  {
    const slug = 'how-game-dna-works', rel = `blog/${slug}/`, P = '../../';
    const title = "I let AI agents add 101 game features to games they'd never seen. A lot of the bugs were mine.";
    const desc = 'How Game DNA elements are built and tested: cold tests by a fresh agent on unseen games, a judge that plays, a strict visual critic, and four failures that changed the method.';
    const src = fs.readFileSync(path.join(ROOT, 'tools', 'showcase', 'blog', slug + '.md'), 'utf8').replace(/\(@\//g, '(' + P);
    const missing = [...src.matchAll(/\]\((\.\.\/\.\.\/[^)]*)\)/g)].map(m => m[1].slice(P.length)).filter(u => !/^(tests|start|basket|styles|about)\/$/.test(u) && !(u.startsWith('dna/') && BY[u.split('/')[1]]));
    if (missing.length) throw new Error('blog post links to missing showcase pages: ' + missing.join(', '));
    const body = `<article class="sc-sec sc-tight sc-post"><div class="sc-wrap">
<p class="sc-eyebrow"><a href="${P}#how">How it works</a> · Method</p>
<h1 class="sc-post-h1">${esc(title)}</h1>
<p class="sc-post-meta">David Chen · <time datetime="${BLOG_PUBLISHED}">${new Date(BLOG_PUBLISHED + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}</time> · about 6 minutes to read</p>
${(() => { const h = 'kart-racer-3d', L = HERO_LOOPS[h]; return `<figure class="sc-post-hero"><a href="${P}dna/${h}/" aria-label="Play the ${esc(BY[h].name)} demo" style="background-image:url('${P}../assets/hero/${h}-poster.webp')">${L ? `<span class="sc-post-loop" style="background-image:url('${P}../assets/hero/${h}.webp');background-size:${L.n * 100}% 100%;animation-duration:${L.n * (L.step || 120)}ms;animation-timing-function:steps(${L.n}, jump-none)"></span>` : ''}</a><figcaption>${esc(BY[h].name)}, one of the 101 elements, running in its demo. <a href="${P}dna/${h}/">Play it</a>.</figcaption></figure>`; })()}
<div class="sc-md sc-post-body">${md2html(src, '')}</div>
<div class="sc-cta"><div><h3>Try it on your game</h3><p class="sc-muted">Pick one element, copy its prompt, hand it to your agent.</p></div><a class="sc-btn sc-btn-hot lg" href="${P}start/">${ICON.play}Start in 5 minutes</a></div>
</div></article>`;
    const postUrl = CANON_BASE + rel;
    const postLd = { '@type': 'BlogPosting', '@id': postUrl + '#post', headline: title, description: desc, url: postUrl, inLanguage: 'en',
      datePublished: BLOG_PUBLISHED, dateModified: BLOG_MODIFIED, author: AUTHOR, publisher: AUTHOR, image: [canonImg(`blog-${slug}`)],
      mainEntityOfPage: { '@type': 'WebPage', '@id': postUrl }, isPartOf: WEBSITE_REF };
    write(`${rel}index.html`, shell({ rel, title: "How Game DNA works · Game DNA", desc, body, og: `blog-${slug}`, ogType: 'article', jsonld: postLd }));
  }

  // =====================================================================================================================
  // internal: build records (everything the showcase leaves out)
  const statusHead = e => { const st = e.status, lc = lastCritic(e);
    return st.headline ? st.headline : !e.critic.length && !st.cold.length ? 'In review: the critic and cold tests are still running.' : !st.cold.length && lc && lc.pass ? 'Passed review; cold tests pending.' : st.fail ? 'Usable, with a known issue: the demo did not pass its final review.' : hasIssue(e) ? 'Passed, with known issues.' : 'Passed review and cold tests.'; };
  const coldSum = e => { let p = 0, n = 0; for (const [, r] of e.status.cold) { const m = String(r).match(/^(\d+)\/(\d+)/); if (m) { p += +m[1]; n += +m[2]; } } return n ? `${p}/${n}` : '—'; };
  {
    const P = '../';
    const rows = E.map(e => { const lc = lastCritic(e);
      return `<tr${hasIssue(e) ? ' class="issue"' : ''}><td><span class="code" data-fam="${e.fam}">${e.code}</span></td><td><a href="dna/${e.id}/">${esc(e.name)}</a></td><td>${e.kind}</td><td>${esc(e.release || 'M7')}</td><td>${e.json.module && e.json.module.version ? 'v' + esc(e.json.module.version) : '—'}</td><td>${lc ? `${lc.starter != null ? lc.demo + ' / ' + lc.starter : lc.demo}${lc.pass ? '' : ' ✗'}` : '—'}</td><td>${e.critic.length}</td><td>${coldSum(e)}</td><td>${e.status.issues.length || ''}</td></tr>`; }).join('');
    const body = `<section class="sc-sec"><div class="sc-wrap">
<p class="sc-eyebrow">Internal</p>
<h1 class="sc-h1-sm">Build records</h1>
<p class="sc-sub">Everything the showcase pages leave out: critic scores, cold tests on unseen games, versions and known issues. Each row opens that element's records page.</p>
<p class="sc-sub">Critic: last round's score (demo / starter), bar ≥ 7.5 with no major issue; ✗ = did not pass. Cold tests: integrated runs over all runs, every round summed (each element page lists them).</p>
<div class="sc-tbl"><table><thead><tr><th>Code</th><th>Element</th><th>Kind</th><th>Added</th><th>Module</th><th>Critic</th><th>Rounds</th><th>Cold tests</th><th>Issues</th></tr></thead><tbody>${rows}</tbody></table></div>
</div></section>`;
    write('internal/index.html', shell({ rel: 'internal/', title: 'Build records · Game DNA (internal)', desc: 'Internal build records of every Game DNA element.', body, internal: true }));
  }
  for (const e of E) {
    const id = e.id;
    const P = '../../../', root = '../../../../../', elRoot = `${root}elements/${id}/`, J = e.json, I = J.interfaces, st = e.status;
    const params = J.params || [];
    const range = p => p.options ? p.options.join(' / ') : p.type === 'text' ? 'any text' : (p.min != null ? `${p.min}–${p.max}${p.step ? ' (step ' + p.step + ')' : ''}` : p.type);
    const coldRows = st.cold.map(([w, r, m]) => `<tr><td>${esc(w)}</td><td>${esc(r)}</td><td>${esc(MODEL[m] || m)}</td></tr>`).join('');
    const criticRows = e.critic.map((r, i) => `<tr><td>r${i + 1}</td><td>${r.demo ?? '—'}</td><td>${r.starter ?? '—'}</td><td>${r.pass ? 'pass' : 'fail'}</td></tr>`).join('');
    const moms = (MOMENTS[id] || []).map((m, k) => `<li><b>${'ABCD'[k]}</b> ${m.t != null ? `t = ${m.t} ms${m.params.length ? ' · ' + esc(m.params.join(' · ')) : ''}` : 'review screenshot, time not recorded'}: ${esc(m.state)}${m.query ? ` (<a href="${elRoot}${m.page || 'demo'}/index.html?${esc(m.query)}" target="_blank" rel="noopener">?${esc(m.query)}</a>)` : ''}</li>`).join('');
    const listOf = a => `<ul>${(a || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
    const compat = (arr, bad) => arr.map(g => `<li><span class="code" data-fam="${BY[g.id].fam}">${BY[g.id].code}</span> ${esc(BY[g.id].name)}: <span class="${bad ? 'sc-bad' : 'sc-muted'}">${esc(g.why)}</span></li>`).join('');
    const readme = e.readmeExists ? fs.readFileSync(path.join(e.dir, e.mod.readme), 'utf8') : '';
    const body = `<section class="sc-sec"><div class="sc-wrap sc-rec">
<p class="sc-eyebrow">Internal · build records</p>
<h1 class="sc-h1-sm"><span class="code" data-fam="${e.fam}">${e.code}</span> ${esc(e.name)}</h1>
<p class="sc-sub"><a href="${P}dna/${id}/">← Showcase page</a> · <a href="${P}internal/">All build records</a> · <a href="${P}../dna/${id}/">Current full page</a></p>
<dl class="sc-kv"><dt>Added</dt><dd>${esc(e.release || 'M7')}${e.release && RELEASE_DATE[e.release] ? ' (' + RELEASE_DATE[e.release] + ')' : ''}</dd><dt>Kind</dt><dd>${e.kind}</dd><dt>Family</dt><dd>${esc(FAMILIES[e.fam].name)}</dd>
<dt>Module</dt><dd>${J.module && J.module.version ? 'v' + esc(J.module.version) + ', ' : ''}<code>${esc(e.mod.file)}</code>, global <code>${esc(e.mod.global)}</code>, sha256 <code>${e.sha}</code></dd>
<dt>Interfaces</dt><dd>${esc(TIME[I.time] || I.time)} · ${esc(COORD_LABEL[id] || COORDS[I.coords] || I.coords)} · layer ${esc(LAYER[I.layer] || I.layer)}</dd>${e.requires.length ? `<dt>Requires</dt><dd>${e.requires.map(r => esc(BY[r].code + ' ' + BY[r].name)).join(', ')}</dd>` : ''}</dl>
<h2>Status</h2>
<p><b>${esc(statusHead(e))}</b></p>
<h3>Critic</h3><p>${esc(criticLine(e))}</p>
${criticRows ? `<div class="sc-tbl"><table><thead><tr><th>Round</th><th>Demo</th><th>Starter</th><th>Verdict</th></tr></thead><tbody>${criticRows}</tbody></table></div>` : ''}
<h3>Cold tests</h3>
${coldRows ? `<div class="sc-tbl"><table><thead><tr><th>Test</th><th>Result</th><th>Model</th></tr></thead><tbody>${coldRows}</tbody></table></div>` : `<p>${esc(st.coldNote || 'No record.')}</p>`}
<p class="sc-muted">A cold test gives a fresh Codex agent (no browser, no access to this repo) only the game, the module and the prompt; an independent judge then plays the result. "Integrated" = the element works, the game is not broken and its autoplay still finishes.</p>
${PERF3D[id] ? `<h3>Frame time</h3><p>${esc(PERF3D[id])}</p>` : ''}
${st.issues.length ? `<h3>Known issues</h3>${listOf(st.issues)}` : ''}
<h2>Parameters</h2>
<div class="sc-tbl"><table><thead><tr><th>Key</th><th>Label</th><th>Range</th><th>Default</th></tr></thead><tbody>${params.map(p => `<tr><td><code>${esc(p.key)}</code></td><td>${esc(p.label)}</td><td>${esc(range(p))}</td><td><code>${esc(p.default)}</code></td></tr>`).join('')}</tbody></table></div>
${(J.variants || []).length ? `<p>Variants: ${J.variants.map(v => esc(v.name)).join(', ')}</p>` : ''}
<h2>Compatibility</h2>
<h3>Needs</h3>${listOf(I.needs)}<h3>Provides</h3>${listOf(I.provides)}
<h3>Goes well with</h3><ul>${compat(e.goodWith, false) || '<li>Nothing specific.</li>'}</ul>
<h3>Conflicts with</h3><ul>${compat(e.conflicts, true) || '<li>None.</li>'}</ul>
<h3>Good for / not for</h3>${listOf(J.fits)}${listOf(J.notFor)}
<h2>Assets</h2>${Array.isArray(J.assets) ? listOf(J.assets) : `<p>${esc(J.assets || 'none')}</p>`}
<h2>Acceptance moments</h2><ul>${moms}</ul><div class="sc-md">${md2html(mdSection(e.md, 7, 'Acceptance moments'), elRoot, { shift: 1 })}</div>
<details class="sc-fold"><summary>Full spec (element.md)</summary><div class="sc-md">${md2html(e.md.replace(/^# [^\n]*\n/, ''), elRoot, { idp: 'spec-' })}</div></details>
${readme ? `<details class="sc-fold"><summary>Module API (README)</summary><div class="sc-md">${md2html(readme, elRoot + path.posix.dirname(e.mod.readme) + '/', { idp: 'api-' })}</div></details>` : ''}
</div></section>`;
    write(`internal/dna/${id}/index.html`, shell({ rel: `internal/dna/${id}/`, title: `${e.code} ${e.name} · build records (internal)`, desc: `Internal build records of ${e.name}.`, body, internal: true }));
  }
  console.log(`built site/preview/: home, ${E.length} element pages, basket, ${S.length} styles, about, start, tests, blog, internal records`);
}
