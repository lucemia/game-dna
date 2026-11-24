// Builds starter/index.html and demo/index.html: the module (verbatim) + shared art + the page script, single files.
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url)), el = path.join(here, '..');
const mod = fs.readFileSync(path.join(el, 'module/iso-height-map.js'), 'utf8'), art = fs.readFileSync(path.join(here, 'art.js'), 'utf8');
for (const [tpl, js, out] of [['starter.html', 'starter.js', 'starter/index.html'], ['demo.html', 'demo.js', 'demo/index.html']]) {
  if (!fs.existsSync(path.join(here, tpl))) continue;
  const html = fs.readFileSync(path.join(here, tpl), 'utf8').split('/*MODULE*/').join(mod).split('/*ART*/').join(art).split('/*GAME*/').join(fs.readFileSync(path.join(here, js), 'utf8'));
  fs.writeFileSync(path.join(el, out), html); console.log('wrote', out, html.length);
}
