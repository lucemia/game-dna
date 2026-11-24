// Builds demo/index.html (kit + scene + module/active-time-battle.js + demo.js) and host/index.html (kit + scene + host.js).
// Run from anywhere: node src/build.mjs. DEMO_ONLY=1 leaves host/ alone. starter/index.html is hand-kept (not built here).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const SRC = path.dirname(fileURLToPath(import.meta.url)), D = path.dirname(SRC);
const rd = f => fs.readFileSync(path.join(SRC, f), 'utf8');
const kit = rd('kit.js'), scene = rd('scene.js'), mod = fs.readFileSync(D + '/module/active-time-battle.js', 'utf8');
function build(src, game, out) {
  let h = rd(src);
  h = h.replace('/*KIT*/', () => '\n' + kit).replace('/*SCENE*/', () => '\n' + scene).replace('/*MODULE*/', () => '\n' + mod).replace('/*GAME*/', () => '\n' + rd(game));
  fs.mkdirSync(out.replace(/\/[^/]+$/, ''), { recursive: true });
  fs.writeFileSync(out, h);
  const bad = h.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => /[⺀-￿]/.test(l.replace(/[×—▲-◀]/g, '')));
  console.log(out, h.split('\n').length, 'lines; CJK lines:', bad.length);
}
build('demo.src.html', 'demo.js', D + '/demo/index.html');
if (!process.env.DEMO_ONLY && fs.existsSync(path.join(SRC, 'host.js'))) build('host.src.html', 'host.js', D + '/host/index.html');
