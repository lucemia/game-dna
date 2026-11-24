// Builds starter/index.html (module/platformer-feel.js and the I-02 parallax module inlined verbatim) and demo/index.html: node src/build.mjs
import fs from 'fs'; import path from 'path'; import url from 'url';
const D = path.dirname(path.dirname(url.fileURLToPath(import.meta.url)));
const rd = f => fs.readFileSync(path.join(D, f), 'utf8');
const mod = rd('module/platformer-feel.js').trimEnd(), par = rd('../parallax-layers/module/parallax-layers.js').trimEnd();
for (const [src, out] of [['src/starter.src.html', 'starter/index.html'], ['src/demo.src.html', 'demo/index.html']]) {
  if (!fs.existsSync(path.join(D, src))) continue;
  const h = rd(src).replace('/*@MODULE*/', () => mod).replace('/*@PARALLAX*/', () => par);
  fs.mkdirSync(path.dirname(path.join(D, out)), { recursive: true }); fs.writeFileSync(path.join(D, out), h); console.log(out, h.length, 'bytes');
}
